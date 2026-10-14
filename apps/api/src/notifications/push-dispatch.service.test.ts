import { FrozenClock } from '../common/clock/clock.service';
import { PushDispatchService } from './push-dispatch.service';
import type { PushGateway, PushDeliveryResult } from '../push/push.gateway';

/**
 * Push dispatch (section 42). These tests are about the claim protocol that
 * makes delivery at-least-once and never twice-per-worker: a row is only sent
 * after a conditional `PENDING` -> `SENDING` update wins, a dead token is pruned
 * rather than retried, and a row stranded in `SENDING` is requeued.
 */
interface NotifRow {
  id: string;
  channel: string;
  status: string;
  attempts: number;
  updatedAt: Date;
  createdAt: Date;
  userId: string | null;
  title: string;
  body: string;
  event: string;
  payload: unknown;
}

interface DeviceRow {
  id: string;
  userId: string;
  token: string;
}

type Where = Record<string, unknown>;

function matches(row: NotifRow, where: Where, devices: DeviceRow[]): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'attempts') return row.attempts < (value as { lt: number }).lt;
    if (key === 'updatedAt') return row.updatedAt < (value as { lt: Date }).lt;
    if (key === 'user') {
      return devices.some((d) => d.userId === row.userId);
    }
    return (row as unknown as Where)[key] === value;
  });
}

class FakePrisma {
  notifications: NotifRow[] = [];
  devices: DeviceRow[] = [];
  /** When set, the conditional claim update loses its race and matches nothing. */
  failClaim = false;

  notification = {
    findMany: async ({ where, take }: { where: Where; take: number }): Promise<NotifRow[]> =>
      this.notifications
        .filter((n) => matches(n, where, this.devices))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, take),
    updateMany: async ({
      where,
      data,
    }: {
      where: Where;
      data: Partial<NotifRow>;
    }): Promise<{ count: number }> => {
      const isClaim = typeof where.id === 'string';
      if (isClaim && this.failClaim) return { count: 0 };
      const hit = this.notifications.filter((n) => matches(n, where, this.devices));
      for (const row of hit) Object.assign(row, data, { updatedAt: new Date() });
      return { count: hit.length };
    },
  };

  deviceToken = {
    findMany: async ({ where }: { where: { userId: string } }): Promise<DeviceRow[]> =>
      this.devices.filter((d) => d.userId === where.userId),
    deleteMany: async ({ where }: { where: { id: string } }): Promise<{ count: number }> => {
      const before = this.devices.length;
      this.devices = this.devices.filter((d) => d.id !== where.id);
      return { count: before - this.devices.length };
    },
  };
}

function notification(overrides: Partial<NotifRow> = {}): NotifRow {
  return {
    id: 'n1',
    channel: 'PUSH',
    status: 'PENDING',
    attempts: 0,
    updatedAt: new Date('2026-10-14T00:00:00.000Z'),
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    userId: 'user_1',
    title: 'Title',
    body: 'Body',
    event: 'MATCH_NEW',
    payload: { match_id: 'm1' },
    ...overrides,
  };
}

function makeGateway(
  send: (m: { token: string }) => Promise<PushDeliveryResult> = async () => ({
    providerMessageId: 'mid',
    invalidToken: false,
  }),
  configured = true,
): PushGateway & { send: jest.Mock } {
  return { configured, send: jest.fn(send) } as unknown as PushGateway & { send: jest.Mock };
}

function makeService(
  prisma: FakePrisma,
  gateway: PushGateway,
  clock: FrozenClock,
): { service: PushDispatchService; notifications: Record<string, jest.Mock> } {
  const notifications = {
    markSent: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    markSuppressed: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PushDispatchService(
    prisma as never,
    gateway,
    notifications as never,
    clock,
  );
  return { service, notifications };
}

describe('PushDispatchService', () => {
  it('does nothing when push is unconfigured', async () => {
    const prisma = new FakePrisma();
    prisma.notifications.push(notification());
    prisma.devices.push({ id: 'd1', userId: 'user_1', token: 't' });
    const gateway = makeGateway(undefined, false);
    const { service, notifications } = makeService(prisma, gateway, new FrozenClock(new Date()));

    expect(await service.dispatch()).toBe(0);
    expect(gateway.send).not.toHaveBeenCalled();
    expect(notifications.markSent).not.toHaveBeenCalled();
  });

  it('claims and delivers a due push to the user\u2019s device', async () => {
    const prisma = new FakePrisma();
    prisma.notifications.push(notification());
    prisma.devices.push({ id: 'd1', userId: 'user_1', token: 'token-1' });
    const gateway = makeGateway();
    const { service, notifications } = makeService(prisma, gateway, new FrozenClock(new Date()));

    expect(await service.dispatch()).toBe(1);

    expect(gateway.send).toHaveBeenCalledWith({
      token: 'token-1',
      title: 'Title',
      body: 'Body',
      data: { event: 'MATCH_NEW', match_id: 'm1' },
    });
    expect(notifications.markSent).toHaveBeenCalledWith('n1', 'mid');
  });

  it('prunes a token FCM reports as unregistered', async () => {
    const prisma = new FakePrisma();
    prisma.notifications.push(notification());
    prisma.devices.push({ id: 'd1', userId: 'user_1', token: 'dead' });
    const gateway = makeGateway(async () => ({ providerMessageId: null, invalidToken: true }));
    const { service, notifications } = makeService(prisma, gateway, new FrozenClock(new Date()));

    expect(await service.dispatch()).toBe(0);
    expect(prisma.devices).toHaveLength(0);
    expect(notifications.markFailed).toHaveBeenCalledWith('n1', 'all device tokens are unregistered');
  });

  it('sends to the surviving device when another is dead', async () => {
    const prisma = new FakePrisma();
    prisma.notifications.push(notification());
    prisma.devices.push(
      { id: 'd1', userId: 'user_1', token: 'dead' },
      { id: 'd2', userId: 'user_1', token: 'live' },
    );
    let call = 0;
    const gateway = makeGateway(async () => {
      call += 1;
      return call === 1
        ? { providerMessageId: null, invalidToken: true }
        : { providerMessageId: 'mid', invalidToken: false };
    });
    const { service, notifications } = makeService(prisma, gateway, new FrozenClock(new Date()));

    expect(await service.dispatch()).toBe(1);
    expect(prisma.devices.map((d) => d.id)).toEqual(['d2']);
    expect(notifications.markSent).toHaveBeenCalledWith('n1', 'mid');
  });

  it('records a provider error as a failure', async () => {
    const prisma = new FakePrisma();
    prisma.notifications.push(notification());
    prisma.devices.push({ id: 'd1', userId: 'user_1', token: 't' });
    const gateway = makeGateway(async () => {
      throw new Error('FCM rejected the send (HTTP 500)');
    });
    const { service, notifications } = makeService(prisma, gateway, new FrozenClock(new Date()));

    expect(await service.dispatch()).toBe(0);
    expect(notifications.markFailed).toHaveBeenCalledWith('n1', 'FCM rejected the send (HTTP 500)');
  });

  it('does not send a notification whose owner has no device', async () => {
    const prisma = new FakePrisma();
    prisma.notifications.push(notification());
    const gateway = makeGateway();
    const { service, notifications } = makeService(prisma, gateway, new FrozenClock(new Date()));

    expect(await service.dispatch()).toBe(0);
    expect(gateway.send).not.toHaveBeenCalled();
    expect(notifications.markSent).not.toHaveBeenCalled();
    expect(notifications.markSuppressed).not.toHaveBeenCalled();
  });

  it('skips a row another worker already claimed', async () => {
    const prisma = new FakePrisma();
    prisma.notifications.push(notification());
    prisma.devices.push({ id: 'd1', userId: 'user_1', token: 't' });
    prisma.failClaim = true;
    const gateway = makeGateway();
    const { service } = makeService(prisma, gateway, new FrozenClock(new Date()));

    expect(await service.dispatch()).toBe(0);
    expect(gateway.send).not.toHaveBeenCalled();
  });

  it('requeues a notification stranded in SENDING past the stale window', async () => {
    const clock = new FrozenClock(new Date('2026-10-14T01:00:00.000Z'));
    const prisma = new FakePrisma();
    prisma.notifications.push(
      notification({
        status: 'SENDING',
        updatedAt: new Date('2026-10-14T00:00:00.000Z'),
        createdAt: new Date('2026-10-14T00:00:00.000Z'),
      }),
    );
    prisma.devices.push({ id: 'd1', userId: 'user_1', token: 't' });
    const gateway = makeGateway();
    const { service, notifications } = makeService(prisma, gateway, clock);

    expect(await service.dispatch()).toBe(1);
    // The requeued row is re-claimed and handed to the sender.
    expect(notifications.markSent).toHaveBeenCalledWith('n1', 'mid');
  });

  it('leaves a freshly-claimed SENDING row alone', async () => {
    const clock = new FrozenClock(new Date('2026-10-14T00:00:30.000Z'));
    const prisma = new FakePrisma();
    const row = notification({
      status: 'SENDING',
      updatedAt: new Date('2026-10-14T00:00:00.000Z'),
      createdAt: new Date('2026-10-14T00:00:00.000Z'),
    });
    prisma.notifications.push(row);
    prisma.devices.push({ id: 'd1', userId: 'user_1', token: 't' });
    const gateway = makeGateway();
    const { service } = makeService(prisma, gateway, clock);

    expect(await service.dispatch()).toBe(0);
    expect(gateway.send).not.toHaveBeenCalled();
    expect(row.status).toBe('SENDING');
  });

  it('ignores notifications that have exhausted their attempts', async () => {
    const prisma = new FakePrisma();
    prisma.notifications.push(notification({ attempts: 5 }));
    prisma.devices.push({ id: 'd1', userId: 'user_1', token: 't' });
    const gateway = makeGateway();
    const { service } = makeService(prisma, gateway, new FrozenClock(new Date()));

    expect(await service.dispatch()).toBe(0);
    expect(gateway.send).not.toHaveBeenCalled();
  });
});
