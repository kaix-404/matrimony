import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClockService, FrozenClock } from '../common/clock/clock.service';
import { PrismaClient, OtpStatus } from '../prisma/prisma-client';
import { OtpService } from './otp.service';
import type { Env } from '../config/env';

/**
 * A double for the `otpRequest` model.
 *
 * `updateMany` and `findFirst` are modelled with the same conditional-update
 * semantics as the real database, because the service relies on them: it counts
 * an attempt with a conditional increment precisely so two concurrent guesses
 * cannot both pass the limit. A double that ignored the predicate would make the
 * service look correct while the guarantee did not exist.
 */
type Row = Record<string, unknown>;

/** The predicate forms this double has to understand, as Prisma emits them. */
type Predicate = string | number | boolean | null | { lt: number };

type Where = Record<string, Predicate>;
type Patch = Record<string, string | number | boolean | Date | null | { increment: number }>;

class FakeOtpStore {
  rows: Row[] = [];

  updateMany = async (args: { where: Where; data: Patch }): Promise<{ count: number }> => {
    let count = 0;
    for (const row of this.rows) {
      if (matches(row, args.where)) {
        apply(row, args.data);
        count += 1;
      }
    }
    return { count };
  };

  create = async ({ data }: { data: Row }) => {
    const row = {
      id: `o${this.rows.length + 1}`,
      attempts: 0,
      verifiedAt: null,
      requestDeviceId: null,
      ...data,
    };
    this.rows.push(row);
    return row;
  };

  findFirst = async (args: { where: Where; orderBy?: { createdAt?: 'asc' | 'desc' } }) => {
    const found = this.rows.filter((row) => matches(row, args.where));
    if (found.length === 0) return null;
    // Newest first, so a superseded code is never the one that matches.
    found.sort((a, b) => (b.createdAt as number) - (a.createdAt as number));
    return found[0];
  };

  update = async (args: { where: { id: string }; data: Patch }) => {
    const row = this.rows.find((r) => r.id === args.where.id);
    if (!row) throw new Error('not found');
    apply(row, args.data);
    return row;
  };
}

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected !== null && typeof expected === 'object') {
      return (row[key] as number) < expected.lt;
    }
    return row[key] === expected;
  });
}

function apply(row: Row, data: Patch): void {
  for (const [key, value] of Object.entries(data)) {
    row[key] =
      typeof value === 'object' && value !== null && 'increment' in value
        ? (row[key] as number) + value.increment
        : value;
  }
}

const env = {
  OTP_HASH_SECRET: 'test-otp-pepper',
  OTP_MAX_ATTEMPTS: 3,
  OTP_RESEND_COOLDOWN_SECONDS: 60,
  OTP_TTL_SECONDS: 300,
  NODE_ENV: 'test',
} as Env;

async function makeService(clock: ClockService) {
  const store = new FakeOtpStore();
  let sequence = 0;

  const moduleRef = await Test.createTestingModule({
    providers: [
      OtpService,
      { provide: 'ENV', useValue: env },
      { provide: ClockService, useValue: clock },
      {
        provide: PrismaClient,
        useValue: {
          otpRequest: {
            ...store,
            // Timestamps must advance with the fake clock, otherwise every row
            // looks created at once and ordering tests cannot see the sequence.
            create: async (args: { data: Row }) => {
              sequence += 1;
              return store.create({ data: { ...args.data, createdAt: sequence } });
            },
          },
        },
      },
    ],
  }).compile();

  return { service: moduleRef.get(OtpService), store };
}

const MOBILE = '9876543210';

describe('OTP issuance', () => {
  it('issues a six-digit code', async () => {
    const { service } = await makeService(new ClockService());

    for (let i = 0; i < 50; i += 1) {
      const issued = await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });
      expect(issued.code).toMatch(/^\d{6}$/);
    }
  });

  it('does not repeat itself across many issues', async () => {
    // A generator that returned the same code twice would make the six digits
    // worth far less than they appear to be.
    const { service } = await makeService(new ClockService());
    const codes = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      codes.add((await service.issue({ mobile: MOBILE, purpose: 'LOGIN' })).code);
    }
    expect(codes.size).toBeGreaterThan(150);
  });

  it('stores only a hash of the code', async () => {
    const { service, store } = await makeService(new ClockService());
    const issued = await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    expect(store.rows[0].codeHash).not.toContain(issued.code);
    expect(String(store.rows[0].codeHash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sets expiry and cooldown from server time', async () => {
    const clock = new FrozenClock(new Date('2026-03-01T10:00:00Z'));
    const { service } = await makeService(clock);

    const issued = await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    expect(issued.expiresAt.getTime() - clock.now().getTime()).toBe(300_000);
    expect(issued.resendAfterAt.getTime() - clock.now().getTime()).toBe(60_000);
  });

  it('supersedes an earlier live request for the same number and purpose', async () => {
    // Otherwise a user who asked for a resend could still have the first code
    // accepted, and neither code would be the one that "just arrived".
    const { service, store } = await makeService(new ClockService());

    const first = await service.issue({ mobile: MOBILE, purpose: 'REGISTRATION' });
    const second = await service.issue({ mobile: MOBILE, purpose: 'REGISTRATION' });

    expect(
      await service.verify({ mobile: MOBILE, purpose: 'REGISTRATION', code: first.code }),
    ).toBeNull();
    expect(
      await service.verify({ mobile: MOBILE, purpose: 'REGISTRATION', code: second.code }),
    ).not.toBeNull();
    expect(store.rows.find((r) => r.id.endsWith('1'))?.status).toBe(OtpStatus.EXPIRED);
  });

  it('does not supersede a request for a different purpose', async () => {
    const { service } = await makeService(new ClockService());

    const registration = await service.issue({ mobile: MOBILE, purpose: 'REGISTRATION' });
    await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    expect(
      await service.verify({ mobile: MOBILE, purpose: 'REGISTRATION', code: registration.code }),
    ).not.toBeNull();
  });

  it("does not supersede another number's request", async () => {
    const { service } = await makeService(new ClockService());

    const other = await service.issue({ mobile: '9000000001', purpose: 'LOGIN' });
    await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    expect(
      await service.verify({ mobile: '9000000001', purpose: 'LOGIN', code: other.code }),
    ).not.toBeNull();
  });

  it('records the device id for rate-limit auditing', async () => {
    const { service, store } = await makeService(new ClockService());
    await service.issue({ mobile: MOBILE, purpose: 'LOGIN', deviceId: 'device-abc' });
    expect(store.rows[0].requestDeviceId).toBe('device-abc');
  });
});

describe('OTP verification', () => {
  it('accepts the correct code once', async () => {
    const { service } = await makeService(new ClockService());
    const issued = await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    const id = await service.verify({ mobile: MOBILE, purpose: 'LOGIN', code: issued.code });

    expect(id).toBe(issued.id);
  });

  it('refuses the same code a second time', async () => {
    const { service } = await makeService(new ClockService());
    const issued = await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    await service.verify({ mobile: MOBILE, purpose: 'LOGIN', code: issued.code });

    expect(
      await service.verify({ mobile: MOBILE, purpose: 'LOGIN', code: issued.code }),
    ).toBeNull();
  });

  it('rejects a wrong code without revealing why', async () => {
    const { service } = await makeService(new ClockService());
    await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    expect(await service.verify({ mobile: MOBILE, purpose: 'LOGIN', code: '000000' })).toBeNull();
  });

  it('counts each wrong guess', async () => {
    const { service, store } = await makeService(new ClockService());
    await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    await service.verify({ mobile: MOBILE, purpose: 'LOGIN', code: '111111' });
    await service.verify({ mobile: MOBILE, purpose: 'LOGIN', code: '222222' });

    expect(store.rows[0].attempts).toBe(2);
  });

  it('does not count a correct guess against the limit', async () => {
    const { service, store } = await makeService(new ClockService());
    const issued = await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    await service.verify({ mobile: MOBILE, purpose: 'LOGIN', code: issued.code });

    expect(store.rows[0].attempts).toBe(0);
  });

  it('stops accepting guesses at the attempt ceiling', async () => {
    const { service, store } = await makeService(new ClockService());
    const issued = await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    for (let i = 0; i < env.OTP_MAX_ATTEMPTS; i += 1) {
      expect(await service.verify({ mobile: MOBILE, purpose: 'LOGIN', code: '999999' })).toBeNull();
    }

    // The correct code is now worthless: the request is spent.
    expect(
      await service.verify({ mobile: MOBILE, purpose: 'LOGIN', code: issued.code }),
    ).toBeNull();
    expect(store.rows[0].status).toBe(OtpStatus.ATTEMPT_LIMIT_REACHED);
  });

  it('never exceeds the recorded ceiling under repeated guessing', async () => {
    const { service, store } = await makeService(new ClockService());
    await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    for (let i = 0; i < 20; i += 1) {
      await service.verify({ mobile: MOBILE, purpose: 'LOGIN', code: '000000' });
    }

    expect(store.rows[0].attempts).toBe(env.OTP_MAX_ATTEMPTS);
  });

  it('marks the request expired at the exact expiry instant', async () => {
    const clock = new FrozenClock(new Date('2026-03-01T10:00:00Z'));
    const { service, store } = await makeService(clock);
    const issued = await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    clock.advance(300_000);

    expect(
      await service.verify({ mobile: MOBILE, purpose: 'LOGIN', code: issued.code }),
    ).toBeNull();
    expect(store.rows[0].status).toBe(OtpStatus.EXPIRED);
  });

  it('accepts a code one millisecond before expiry', async () => {
    const clock = new FrozenClock(new Date('2026-03-01T10:00:00Z'));
    const { service } = await makeService(clock);
    const issued = await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    clock.advance(299_999);

    expect(
      await service.verify({ mobile: MOBILE, purpose: 'LOGIN', code: issued.code }),
    ).not.toBeNull();
  });

  it('refuses a code issued for a different number', async () => {
    const { service } = await makeService(new ClockService());
    const issued = await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    expect(
      await service.verify({ mobile: '9000000009', purpose: 'LOGIN', code: issued.code }),
    ).toBeNull();
  });

  it('refuses a code issued for a different purpose', async () => {
    // This is what stops a code sent to prove a phone number from also
    // authorising account deletion.
    const { service } = await makeService(new ClockService());
    const issued = await service.issue({ mobile: MOBILE, purpose: 'DELETE_ACCOUNT' });

    expect(
      await service.verify({ mobile: MOBILE, purpose: 'LOGIN', code: issued.code }),
    ).toBeNull();
  });

  it('returns null for a number that never requested a code', async () => {
    const { service } = await makeService(new ClockService());
    expect(await service.verify({ mobile: MOBILE, purpose: 'LOGIN', code: '123456' })).toBeNull();
  });
});

describe('OTP cooldown', () => {
  it('reports the remaining wait', async () => {
    const clock = new FrozenClock(new Date('2026-03-01T10:00:00Z'));
    const { service } = await makeService(clock);

    await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    expect(await service.remainingResendSeconds(MOBILE, 'LOGIN')).toBe(60);

    clock.advance(30_000);
    expect(await service.remainingResendSeconds(MOBILE, 'LOGIN')).toBe(30);

    clock.advance(30_000);
    expect(await service.remainingResendSeconds(MOBILE, 'LOGIN')).toBe(0);
  });

  it('throws 429 while cooling down, with the wait in the body', async () => {
    const { service } = await makeService(new FrozenClock(new Date('2026-03-01T10:00:00Z')));
    await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    await expect(service.assertNotCoolingDown(MOBILE, 'LOGIN')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { retry_after_seconds: 60 },
    });
  });

  it('allows a request once the cooldown has passed', async () => {
    const clock = new FrozenClock(new Date('2026-03-01T10:00:00Z'));
    const { service } = await makeService(clock);

    await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });
    clock.advance(60_000);

    await expect(service.assertNotCoolingDown(MOBILE, 'LOGIN')).resolves.toBeUndefined();
  });

  it('does not count a cooldown against another number', async () => {
    const { service } = await makeService(new FrozenClock(new Date('2026-03-01T10:00:00Z')));
    await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    await expect(service.assertNotCoolingDown('9000000002', 'LOGIN')).resolves.toBeUndefined();
  });

  it('does not count a cooldown against another purpose', async () => {
    const { service } = await makeService(new FrozenClock(new Date('2026-03-01T10:00:00Z')));
    await service.issue({ mobile: MOBILE, purpose: 'LOGIN' });

    await expect(service.assertNotCoolingDown(MOBILE, 'DELETE_ACCOUNT')).resolves.toBeUndefined();
  });
});
