import { DeviceTokensService } from './device-tokens.service';

/**
 * Device registration (section 42). The behaviours worth pinning are the ones a
 * contract test cannot see: that registering the same token again reassigns it
 * to the new user (so a sign-out/sign-in on one phone does not keep pushing to
 * the old account), and that deletion is scoped to the owner.
 */
interface DeviceRow {
  id: string;
  userId: string;
  token: string;
  platform: string;
  deviceId: string | null;
  lastSeenAt: Date;
  createdAt: Date;
}

class FakePrisma {
  rows: DeviceRow[] = [];

  deviceToken = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { token: string };
      create: Partial<DeviceRow>;
      update: Partial<DeviceRow>;
    }): Promise<DeviceRow> => {
      const existing = this.rows.find((r) => r.token === where.token);
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const row: DeviceRow = {
        id: `dev_${this.rows.length + 1}`,
        userId: create.userId as string,
        token: create.token as string,
        platform: create.platform as string,
        deviceId: (create.deviceId as string | null) ?? null,
        lastSeenAt: create.lastSeenAt as Date,
        createdAt: create.lastSeenAt as Date,
      };
      this.rows.push(row);
      return row;
    },
    deleteMany: async ({
      where,
    }: {
      where: { token: string; userId: string };
    }): Promise<{ count: number }> => {
      const before = this.rows.length;
      this.rows = this.rows.filter(
        (r) => !(r.token === where.token && r.userId === where.userId),
      );
      return { count: before - this.rows.length };
    },
    findMany: async ({ where }: { where: { userId: string } }): Promise<DeviceRow[]> =>
      this.rows
        .filter((r) => r.userId === where.userId)
        .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime()),
  };
}

describe('DeviceTokensService', () => {
  it('registers a device and returns a response without the token', async () => {
    const prisma = new FakePrisma();
    const service = new DeviceTokensService(prisma as never);

    const result = await service.register('user_1', { token: 'tok-a', platform: 'ANDROID' });

    expect(result).toEqual({
      id: 'dev_1',
      platform: 'ANDROID',
      device_id: null,
      last_seen_at: expect.any(Date),
      created_at: expect.any(Date),
    });
    expect(JSON.stringify(result)).not.toContain('tok-a');
  });

  it('reassigns a token to the user who just logged in on the device', async () => {
    const prisma = new FakePrisma();
    const service = new DeviceTokensService(prisma as never);

    await service.register('user_1', { token: 'shared-token', platform: 'IOS' });
    await service.register('user_2', { token: 'shared-token', platform: 'IOS' });

    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0].userId).toBe('user_2');
  });

  it('refreshes last_seen_at and device_id on re-registration', async () => {
    const prisma = new FakePrisma();
    const service = new DeviceTokensService(prisma as never);

    await service.register('user_1', { token: 'tok', platform: 'WEB' });
    const first = prisma.rows[0].lastSeenAt;

    await new Promise((resolve) => setTimeout(resolve, 2));
    await service.register('user_1', {
      token: 'tok',
      platform: 'WEB',
      device_id: 'install-9',
    });

    expect(prisma.rows[0].deviceId).toBe('install-9');
    expect(prisma.rows[0].lastSeenAt.getTime()).toBeGreaterThanOrEqual(first.getTime());
  });

  it('unregisters only the caller-owned token', async () => {
    const prisma = new FakePrisma();
    const service = new DeviceTokensService(prisma as never);
    await service.register('user_1', { token: 'tok-a', platform: 'ANDROID' });
    await service.register('user_2', { token: 'tok-b', platform: 'ANDROID' });

    await service.unregister('user_1', 'tok-b');
    // user_1 does not own tok-b, so nothing is removed.
    expect(prisma.rows).toHaveLength(2);

    await service.unregister('user_1', 'tok-a');
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0].token).toBe('tok-b');
  });

  it('lists a user\u2019s devices, most recently seen first', async () => {
    const prisma = new FakePrisma();
    const service = new DeviceTokensService(prisma as never);
    await service.register('user_1', { token: 'old', platform: 'ANDROID' });
    await prisma.deviceToken.upsert({
      where: { token: 'new' },
      create: {
        userId: 'user_1',
        token: 'new',
        platform: 'IOS',
        lastSeenAt: new Date(Date.now() + 1000),
      },
      update: {},
    });

    const devices = await service.listForUser('user_1');
    expect(devices.map((d) => d.platform)).toEqual(['IOS', 'ANDROID']);
  });
});
