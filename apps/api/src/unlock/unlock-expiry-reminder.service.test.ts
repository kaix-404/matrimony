import { FrozenClock } from '../common/clock/clock.service';
import { NOTIFICATION_EVENTS } from '@matrimony/shared';
import { UnlockExpiryReminder } from './unlock-expiry-reminder.service';
import type { DueUnlockReminder } from './unlock.service';

/**
 * The reminder scheduler.
 *
 * The claim itself is proven in `unlock.service.test.ts`; these tests are about
 * what the scheduler does with a claim — one notification per unlock, keyed off
 * the configured lead time, and a failure swallowed so a background timer can
 * never take the process down.
 */

const NOW = new Date('2026-10-04T12:00:00.000Z');
const EXPIRES = new Date('2026-10-04T13:00:00.000Z');

function due(overrides: Partial<DueUnlockReminder> = {}): DueUnlockReminder {
  return {
    unlockId: 'unlock_1',
    userId: 'user_viewer',
    profileId: 'profile_target',
    displayName: 'Ananya Sharma',
    unlockExpiresAt: EXPIRES,
    ...overrides,
  };
}

function make(options: { hours?: number; due?: DueUnlockReminder[]; fail?: boolean } = {}) {
  const clock = new FrozenClock(NOW);
  const notifications: Record<string, unknown>[] = [];
  const unlocks = {
    claimDueReminders: jest.fn(async () => {
      if (options.fail) throw new Error('database is down');
      return options.due ?? [];
    }),
  };
  const notifier = {
    create: jest.fn(async (data: Record<string, unknown>) => {
      notifications.push(data);
      return { id: `n${notifications.length}`, ...data };
    }),
  };
  const env = { UNLOCK_EXPIRY_REMINDER_HOURS: options.hours ?? 2 };

  const service = new UnlockExpiryReminder(
    unlocks as never,
    notifier as never,
    clock,
    env as never,
  );
  return { service, unlocks, notifier, notifications };
}

describe('UnlockExpiryReminder', () => {
  it('passes the configured lead time to the claim', async () => {
    const { service, unlocks } = make({ hours: 5 });

    await service.sweep();

    expect(unlocks.claimDueReminders).toHaveBeenCalledWith(5 * 60 * 60 * 1000, NOW);
  });

  it('records one in-app notification per claimed unlock', async () => {
    const { service, notifications } = make({ due: [due(), due({ unlockId: 'unlock_2' })] });

    const count = await service.sweep();

    expect(count).toBe(2);
    expect(notifications).toHaveLength(2);
    expect(notifications[0]).toMatchObject({
      userId: 'user_viewer',
      event: NOTIFICATION_EVENTS.UNLOCK_EXPIRING_IN_2H,
      channel: 'IN_APP',
      payload: {
        unlock_id: 'unlock_1',
        profile_id: 'profile_target',
        unlock_expires_at: EXPIRES.toISOString(),
      },
    });
  });

  it('names the profile in the body, and stays generic without a name', async () => {
    const { service, notifications } = make({ due: [due({ displayName: null })] });

    await service.sweep();

    expect(String(notifications[0].body)).toContain('a profile you unlocked');
    expect(String(notifications[0].body)).toContain('2 hours');
  });

  it('records nothing when no unlock is due', async () => {
    const { service, notifier } = make();

    expect(await service.sweep()).toBe(0);
    expect(notifier.create).not.toHaveBeenCalled();
  });

  it('lets a claim failure reject, so the timer wrapper is what guards', async () => {
    const { service } = make({ fail: true });

    await expect(service.sweep()).rejects.toThrow('database is down');
  });

  it('does not throw from the bootstrap hook when a sweep fails', () => {
    const { service } = make({ fail: true });

    // `onApplicationBootstrap` fires `safeSweep` without awaiting; a thrown
    // error here would become an unhandled rejection that kills the process.
    expect(() => service.onApplicationBootstrap()).not.toThrow();
    service.onModuleDestroy();
  });
});
