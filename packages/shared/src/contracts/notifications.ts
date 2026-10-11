import { z } from 'zod';
import { NOTIFICATION_EVENTS } from '../enums.js';

export const NotificationChannelSchema = z.enum(['PUSH', 'SMS', 'EMAIL', 'IN_APP']);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const NotificationStatusSchema = z.enum(['PENDING', 'SENT', 'FAILED', 'SUPPRESSED']);
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;

export const NotificationEventSchema = z.string().min(1).max(200);
export type NotificationEvent = z.infer<typeof NotificationEventSchema>;

export const NotificationEventEnumSchema = z.nativeEnum(NOTIFICATION_EVENTS);
export type NotificationEventEnum = keyof typeof NOTIFICATION_EVENTS;

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
