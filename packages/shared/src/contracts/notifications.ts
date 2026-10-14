import { z } from 'zod';
import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS } from '../enums.js';

/**
 * `NotificationChannel` and `NotificationEvent` are defined once in `enums.ts`
 * and re-exported from the barrel. The schemas here are built FROM those
 * constants rather than re-declaring the unions: two `export type
 * NotificationChannel` declarations across the same barrel collide (TS2308),
 * which is exactly what broke the shared build. Sourcing the zod enum from
 * `NOTIFICATION_CHANNELS`/`NOTIFICATION_EVENTS` keeps the runtime list and the
 * compile-time union impossible to drift apart.
 */
export const NotificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);

/**
 * Delivery states. `SENDING` is a short-lived in-flight claim: a dispatcher
 * flips a `PENDING` row to `SENDING` before it calls the provider, so two
 * workers cannot both send the same notification. A row left `SENDING` by a
 * crashed worker is requeued once it goes stale.
 */
export const NotificationStatusSchema = z.enum(['PENDING', 'SENDING', 'SENT', 'FAILED', 'SUPPRESSED']);
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;

/** Free-form event key as stored on the row; may be any section-42 string. */
export const NotificationEventSchema = z.string().min(1).max(200);

export const NotificationEventEnumSchema = z.nativeEnum(NOTIFICATION_EVENTS);
export type NotificationEventEnum = z.infer<typeof NotificationEventEnumSchema>;

export const NotificationPayloadSchema = z.record(z.unknown()).optional();
export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;

export const NotificationResponseSchema = z.object({
  id: z.string().cuid(),
  userId: z.string().cuid().nullable(),
  event: z.string(),
  channel: NotificationChannelSchema,
  status: NotificationStatusSchema,
  title: z.string(),
  body: z.string(),
  payload: NotificationPayloadSchema,
  isCritical: z.boolean(),
  providerMessageId: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  sentAt: z.date().nullable(),
  createdByAdminId: z.string().cuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type NotificationResponse = z.infer<typeof NotificationResponseSchema>;

export const ListNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  cursor: z.string().cuid().optional(),
  channel: NotificationChannelSchema.optional(),
  status: NotificationStatusSchema.optional(),
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;

export const ListNotificationsResponseSchema = z.object({
  notifications: z.array(NotificationResponseSchema),
  nextCursor: z.string().cuid().nullable(),
  hasMore: z.boolean(),
});
export type ListNotificationsResponse = z.infer<typeof ListNotificationsResponseSchema>;

export const MarkNotificationReadSchema = z.object({
  notificationId: z.string().cuid(),
});
export type MarkNotificationReadRequest = z.infer<typeof MarkNotificationReadSchema>;

export const MarkAllNotificationsReadSchema = z.object({
  channel: NotificationChannelSchema.optional(),
});
export type MarkAllNotificationsReadRequest = z.infer<typeof MarkAllNotificationsReadSchema>;

export const CreateSystemNotificationSchema = z.object({
  userId: z.string().cuid().optional(),
  event: NotificationEventSchema,
  channel: NotificationChannelSchema.default('IN_APP'),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  payload: NotificationPayloadSchema,
  isCritical: z.boolean().optional().default(false),
});
export type CreateSystemNotificationRequest = z.infer<typeof CreateSystemNotificationSchema>;
