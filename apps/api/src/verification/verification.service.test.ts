import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { VerificationService, parseBirthYear } from './verification.service';
import type { VerificationGateway } from './verification.gateway';

/**
 * D9 turns on one transition: a passed ID check is the only thing that may move
 * an account from PENDING_VERIFICATION to AWAITING_SETUP_FEE. These tests cover
 * the ways that could go wrong — a forged reference, a failed check, a replayed
 * success, a late success against an account that already left the funnel — and
 * the initiate path, which must capture consent before it calls the supplier
 * and must fail closed when the supplier is not configured.
 */
interface FakeIdentity {
  id: string;
  userId: string;
  providerReference: string | null;
  providerReferenceExpiresAt: Date | null;
  status: string;
  verifiedAt: Date | null;
  failureReason: string | null;
  failureCode: string | null;
  nameOnId: string | null;
  yearOfBirth: number | null;
  consentRecordId: string | null;
}

interface FakeUser {
  id: string;
  status: string;
  identityVerifiedAt: Date | null;
  statusChangedAt: Date | null;
  statusChangeReason: string | null;
}

interface FakeConsent {
  id: string;
  userId: string | null;
  type: string;
  status: string;
  policyVersion: string;
  grantedAt: Date;
}

function harness() {
  const identities: FakeIdentity[] = [];
  const users: FakeUser[] = [];
  const consents: FakeConsent[] = [];
  let seq = 1;

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.find((u) => u.id === where.id) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status: string };
        data: Partial<FakeUser>;
      }) => {
        const matches = users.filter((u) => u.id === where.id && u.status === where.status);
        for (const row of matches) Object.assign(row, data);
        return { count: matches.length };
      },
    },
    identityVerification: {
      findUnique: async ({ where }: { where: { id?: string; userId?: string } }) => {
        if (where.id !== undefined) return identities.find((i) => i.id === where.id) ?? null;
        return identities.find((i) => i.userId === where.userId) ?? null;
      },
      findFirst: async ({ where }: { where: { providerReference: string } }) =>
        identities.find((i) => i.providerReference === where.providerReference) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: Partial<FakeIdentity>;
        update: Partial<FakeIdentity>;
      }) => {
        const existing = identities.find((i) => i.userId === where.userId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row: FakeIdentity = {
          id: `i${seq++}`,
          userId: where.userId,
          providerReference: null,
          providerReferenceExpiresAt: null,
          status: 'PENDING',
          verifiedAt: null,
          failureReason: null,
          failureCode: null,
          nameOnId: null,
          yearOfBirth: null,
          consentRecordId: null,
          ...create,
        };
        identities.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeIdentity> }) => {
        const row = identities.find((i) => i.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    consentRecord: {
      create: async ({ data }: { data: Partial<FakeConsent> }) => {
        const row: FakeConsent = {
          id: `c${seq++}`,
          userId: null,
          type: 'AADHAAR_PROCESSING',
          status: 'GRANTED',
          policyVersion: 'v1',
          grantedAt: new Date(),
          ...data,
        };
        consents.push(row);
        return row;
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
  };

  return {
    users,
    identities,
    consents,
    seedIdentity(overrides: Partial<FakeIdentity> = {}): FakeIdentity {
      const row: FakeIdentity = {
        id: `i${seq++}`,
        userId: 'u1',
        providerReference: 'ref-1',
        providerReferenceExpiresAt: null,
        status: 'PENDING',
        verifiedAt: null,
        failureReason: null,
        failureCode: null,
        nameOnId: null,
        yearOfBirth: null,
        consentRecordId: null,
        ...overrides,
      };
      identities.push(row);
      return row;
    },
    seedUser(id: string, status: string): FakeUser {
      const row: FakeUser = {
        id,
        status,
        identityVerifiedAt: null,
        statusChangedAt: null,
        statusChangeReason: null,
      };
      users.push(row);
      return row;
    },
    service(gateway: VerificationGateway): VerificationService {
      return new VerificationService(prisma as never, gateway);
    },
  };
}

function gateway(overrides: Partial<VerificationGateway> = {}): VerificationGateway {
  return {
    configured: true,
    createDigiLockerSession: async () => ({
      providerReference: 'cf-12345',
      url: 'https://verification-test.cashfree.com/dgl/h7562ci7us0',
      expiresAt: new Date(Date.now() + 600_000),
    }),
    verifyWebhookSignature: () => true,
    ...overrides,
  } as VerificationGateway;
}

describe('VerificationService.handleWebhook', () => {
  it('advances a PENDING_VERIFICATION user to AWAITING_SETUP_FEE on success', async () => {
    const h = harness();
    const identity = h.seedIdentity();
    const user = h.seedUser('u1', 'PENDING_VERIFICATION');

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_SUCCESS',
      data: {
        verification_id: identity.id,
        status: 'AUTHENTICATED',
        user_details: { name: 'John Doe', dob: '02-02-1995' },
      },
    });

    expect(user.status).toBe('AWAITING_SETUP_FEE');
    expect(user.identityVerifiedAt).toBeInstanceOf(Date);
    expect(user.statusChangedAt).toBeInstanceOf(Date);
    expect(identity.status).toBe('VERIFIED');
    expect(identity.nameOnId).toBe('John Doe');
    expect(identity.yearOfBirth).toBe(1995);
  });

  it('finds the attempt by reference id when the vendor omits verification_id', async () => {
    const h = harness();
    const identity = h.seedIdentity({ providerReference: '999' });
    const user = h.seedUser('u1', 'PENDING_VERIFICATION');

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_SUCCESS',
      data: { reference_id: 999 },
    });

    expect(identity.status).toBe('VERIFIED');
    expect(user.status).toBe('AWAITING_SETUP_FEE');
  });

  it('leaves the account untouched when the user denies consent', async () => {
    const h = harness();
    const identity = h.seedIdentity();
    const user = h.seedUser('u1', 'PENDING_VERIFICATION');

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_CONSENT_DENIED',
      data: { verification_id: identity.id, status: 'CONSENT_DENIED' },
    });

    expect(user.status).toBe('PENDING_VERIFICATION');
    expect(user.identityVerifiedAt).toBeNull();
    expect(identity.status).toBe('FAILED');
    expect(identity.failureCode).toBe('DIGILOCKER_VERIFICATION_CONSENT_DENIED');
    expect(identity.failureReason).toBe('CONSENT_DENIED');
  });

  it('marks an expired consent link as EXPIRED so the user can start again', async () => {
    const h = harness();
    const identity = h.seedIdentity();

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_LINK_EXPIRED',
      data: { verification_id: identity.id, status: 'EXPIRED' },
    });

    expect(identity.status).toBe('EXPIRED');
    expect(identity.failureCode).toBe('DIGILOCKER_VERIFICATION_LINK_EXPIRED');
  });

  it('never downgrades a check that already passed', async () => {
    const h = harness();
    const identity = h.seedIdentity({ status: 'VERIFIED', verifiedAt: new Date() });

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_LINK_EXPIRED',
      data: { verification_id: identity.id },
    });

    expect(identity.status).toBe('VERIFIED');
  });

  it('does not pull an ACTIVE account back through the funnel on a replayed success', async () => {
    const h = harness();
    const identity = h.seedIdentity();
    const user = h.seedUser('u1', 'ACTIVE');
    user.identityVerifiedAt = new Date();

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_SUCCESS',
      data: { verification_id: identity.id },
    });

    expect(user.status).toBe('ACTIVE');
  });

  it('ignores an unknown verification id', async () => {
    const h = harness();
    h.seedIdentity();
    const user = h.seedUser('u1', 'PENDING_VERIFICATION');

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_SUCCESS',
      data: { verification_id: 'nope' },
    });

    expect(user.status).toBe('PENDING_VERIFICATION');
  });

  it('ignores a webhook with no identifiers at all', async () => {
    const h = harness();
    h.seedIdentity();
    const user = h.seedUser('u1', 'PENDING_VERIFICATION');

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_SUCCESS',
      data: { status: 'AUTHENTICATED' },
    });

    expect(user.status).toBe('PENDING_VERIFICATION');
  });

  it('ignores an event it does not model instead of failing the delivery', async () => {
    const h = harness();
    const identity = h.seedIdentity();

    await expect(
      h.service(gateway()).handleWebhook({
        event_type: 'DIGILOCKER_SOMETHING_NEW',
        data: { verification_id: identity.id },
      }),
    ).resolves.toBeUndefined();

    expect(identity.status).toBe('PENDING');
  });
});

describe('VerificationService.getVerificationStatus', () => {
  it('reports NOT_STARTED rather than an error when nothing was ever attempted', async () => {
    const h = harness();

    const status = await h.service(gateway()).getVerificationStatus('u1');

    expect(status.status).toBe('NOT_STARTED');
    expect(status.verifiedAt).toBeNull();
  });
});

describe('VerificationService.initiateVerification', () => {
  it('captures Aadhaar consent, then returns the DigiLocker URL', async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');
    const service = h.service(gateway());

    const result = await service.initiateVerification('u1', { provider: 'DIGILOCKER' });

    expect(h.consents).toHaveLength(1);
    expect(h.consents[0].type).toBe('AADHAAR_PROCESSING');
    expect(h.identities[0].consentRecordId).toBe(h.consents[0].id);
    expect(result.status).toBe('PENDING');
    expect(result.redirect_url).toBe('https://verification-test.cashfree.com/dgl/h7562ci7us0');
    expect(h.identities[0].providerReference).toBe('cf-12345');
    expect(h.identities[0].providerReferenceExpiresAt).toBeInstanceOf(Date);
  });

  it('sends our own row id to the vendor so the callback is attributable', async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');
    const calls: string[] = [];

    const service = h.service(
      gateway({
        createDigiLockerSession: async ({ verificationId }) => {
          calls.push(verificationId);
          return {
            providerReference: 'cf-1',
            url: 'https://verification-test.cashfree.com/dgl/x',
            expiresAt: new Date(),
          };
        },
      }),
    );

    await service.initiateVerification('u1', { provider: 'DIGILOCKER' });

    expect(calls).toEqual([h.identities[0].id]);
  });

  it('fails closed when the supplier is not configured', async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');
    const service = h.service(gateway({ configured: false }));

    await expect(service.initiateVerification('u1', { provider: 'DIGILOCKER' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    // Nothing was recorded: an attempt that cannot happen must not capture
    // Aadhaar consent or claim a pending check.
    expect(h.consents).toHaveLength(0);
    expect(h.identities).toHaveLength(0);
  });

  it('reports a vendor failure as unavailable rather than as a broken request', async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');
    const service = h.service(
      gateway({
        createDigiLockerSession: async () => {
          throw new Error('Cashfree DigiLocker URL creation failed (HTTP 401)');
        },
      }),
    );

    await expect(service.initiateVerification('u1', { provider: 'DIGILOCKER' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('refuses an Aadhaar method we have no licence to use', async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');
    const service = h.service(gateway());

    await expect(
      service.initiateVerification('u1', { provider: 'AADHAAR_UIDAI' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not start a second session for an account that already passed', async () => {
    const h = harness();
    h.seedUser('u1', 'AWAITING_SETUP_FEE');
    h.seedIdentity({ status: 'VERIFIED', verifiedAt: new Date() });
    const service = h.service(gateway());

    const result = await service.initiateVerification('u1', { provider: 'DIGILOCKER' });

    expect(result.status).toBe('VERIFIED');
    expect(result.redirect_url).toBeUndefined();
    expect(h.consents).toHaveLength(0);
  });
});

describe('parseBirthYear', () => {
  it('understands the DD-MM-YYYY date Cashfree sends', () => {
    expect(parseBirthYear('02-02-1995')).toBe(1995);
  });

  it('understands an ISO date', () => {
    expect(parseBirthYear('1995-02-02')).toBe(1995);
  });

  it('returns null for something it cannot read', () => {
    expect(parseBirthYear('not-a-date')).toBeNull();
    expect(parseBirthYear(undefined)).toBeNull();
  });
});
