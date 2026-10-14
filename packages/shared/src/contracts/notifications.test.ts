import {
  CreateSystemNotificationSchema,
  ListNotificationsQuerySchema,
  MarkNotificationReadSchema,
  NotificationChannelSchema,
  NotificationEventEnumSchema,
  NotificationResponseSchema,
  NotificationStatusSchema,
} from './notifications.js';
import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS } from '../enums.js';

/**
 * Notification contract tests — section 42.
 *
 * The schemas here were the ones that broke the shared build: `NotificationChannel`
 * and `NotificationEvent` are declared in `enums.ts`, so the contract builds its
 * zod enums FROM those constants rather than re-declaring the unions. These tests
 * assert that sourcing, so a future edit cannot quietly reintroduce a second,
 * divergent list.
 */

const CUID = 'clx00000000000000000000a';

describe('NotificationChannelSchema', () => {
  it('accepts exactly the channels enums.ts declares', () => {
    expect(NotificationChannelSchema.options).toEqual([...NOTIFICATION_CHANNELS]);
    for (const channel of NOTIFICATION_CHANNELS) {
      expect(NotificationChannelSchema.parse(channel)).toBe(channel);
    }
  });

  it('rejects an unknown channel', () => {
    expect(NotificationChannelSchema.safeParse('WHATSAPP').success).toBe(false);
    expect(NotificationChannelSchema.safeParse('push').success).toBe(false);
  });
});

describe('NotificationEventEnumSchema', () => {
  it('accepts every known section-42 event', () => {
    for (const event of Object.values(NOTIFICATION_EVENTS)) {
      expect(NotificationEventEnumSchema.parse(event)).toBe(event);
    }
  });

  it('rejects an event that is not in the catalogue', () => {
    expect(NotificationEventEnumSchema.safeParse('MADE_UP_EVENT').success).toBe(false);
  });
});

describe('NotificationStatusSchema', () => {
  it('allows only the four delivery states', () => {
    for (const status of ['PENDING', 'SENT', 'FAILED', 'SUPPRESSED']) {
      expect(NotificationStatusSchema.parse(status)).toBe(status);
    }
    expect(NotificationStatusSchema.safeParse('DELIVERED').success).toBe(false);
  });
});

describe('ListNotificationsQuerySchema', () => {
  it('defaults the page size and leaves the cursor optional', () => {
    expect(ListNotificationsQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it('coerces a stringified limit, because query params are always strings', () => {
    expect(ListNotificationsQuerySchema.parse({ limit: '5' }).limit).toBe(5);
  });

  it('refuses a page larger than 100', () => {
    expect(ListNotificationsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(ListNotificationsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe('NotificationResponseSchema', () => {
  const row = {
    id: CUID,
    userId: CUID,
    event: 'PROFILE_APPROVED',
    channel: 'IN_APP',
    status: 'SENT',
    title: 'Approved',
    body: 'Your profile was approved.',
    isCritical: false,
    providerMessageId: null,
    attempts: 1,
    lastError: null,
    sentAt: new Date('2026-10-13T00:00:00.000Z'),
    createdByAdminId: null,
    createdAt: new Date('2026-10-13T00:00:00.000Z'),
    updatedAt: new Date('2026-10-13T00:00:00.000Z'),
  };

  it('parses a stored row and allows a null audience for broadcast events', () => {
    expect(NotificationResponseSchema.parse({ ...row, userId: null }).userId).toBeNull();
  });

  it('requires the channel and status to be known values', () => {
    expect(NotificationResponseSchema.safeParse({ ...row, channel: 'WHATSAPP' }).success).toBe(false);
    expect(NotificationResponseSchema.safeParse({ ...row, status: 'DELIVERED' }).success).toBe(false);
  });
});

describe('MarkNotificationReadSchema', () => {
  it('requires a cuid, so a stray identifier cannot be recorded as read', () => {
    expect(MarkNotificationReadSchema.safeParse({ notificationId: CUID }).success).toBe(true);
    expect(MarkNotificationReadSchema.safeParse({ notificationId: 'nope' }).success).toBe(false);
  });
});

describe('CreateSystemNotificationSchema', () => {
  it('defaults the channel to IN_APP and is_critical to false', () => {
    const parsed = CreateSystemNotificationSchema.parse({
      event: 'SYSTEM_ANNOUNCEMENT',
      title: 'Maintenance',
      body: 'The app will be down at 2am.',
    });
    expect(parsed.channel).toBe('IN_APP');
    expect(parsed.isCritical).toBe(false);
  });

  it('requires a title and a body', () => {
    expect(
      CreateSystemNotificationSchema.safeParse({
        event: 'SYSTEM_ANNOUNCEMENT',
        title: '',
        body: 'x',
      }).success,
    ).toBe(false);
    expect(
      CreateSystemNotificationSchema.safeParse({
        event: 'SYSTEM_ANNOUNCEMENT',
        title: 'x',
        body: '',
      }).success,
    ).toBe(false);
  });
});
