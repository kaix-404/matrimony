"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateSystemNotificationSchema = exports.MarkAllNotificationsReadSchema = exports.MarkNotificationReadSchema = exports.ListNotificationsResponseSchema = exports.ListNotificationsQuerySchema = exports.NotificationResponseSchema = exports.NotificationPayloadSchema = exports.NotificationEventEnumSchema = exports.NotificationEventSchema = exports.NotificationStatusSchema = exports.NotificationChannelSchema = void 0;
const zod_1 = require("zod");
const enums_js_1 = require("../enums.js");
/**
 * `NotificationChannel` and `NotificationEvent` are defined once in `enums.ts`
 * and re-exported from the barrel. The schemas here are built FROM those
 * constants rather than re-declaring the unions: two `export type
 * NotificationChannel` declarations across the same barrel collide (TS2308),
 * which is exactly what broke the shared build. Sourcing the zod enum from
 * `NOTIFICATION_CHANNELS`/`NOTIFICATION_EVENTS` keeps the runtime list and the
 * compile-time union impossible to drift apart.
 */
exports.NotificationChannelSchema = zod_1.z.enum(enums_js_1.NOTIFICATION_CHANNELS);
/**
 * Delivery states. `SENDING` is a short-lived in-flight claim: a dispatcher
 * flips a `PENDING` row to `SENDING` before it calls the provider, so two
 * workers cannot both send the same notification. A row left `SENDING` by a
 * crashed worker is requeued once it goes stale.
 */
exports.NotificationStatusSchema = zod_1.z.enum(['PENDING', 'SENDING', 'SENT', 'FAILED', 'SUPPRESSED']);
/** Free-form event key as stored on the row; may be any section-42 string. */
exports.NotificationEventSchema = zod_1.z.string().min(1).max(200);
exports.NotificationEventEnumSchema = zod_1.z.nativeEnum(enums_js_1.NOTIFICATION_EVENTS);
exports.NotificationPayloadSchema = zod_1.z.record(zod_1.z.unknown()).optional();
exports.NotificationResponseSchema = zod_1.z.object({
    id: zod_1.z.string().cuid(),
    userId: zod_1.z.string().cuid().nullable(),
    event: zod_1.z.string(),
    channel: exports.NotificationChannelSchema,
    status: exports.NotificationStatusSchema,
    title: zod_1.z.string(),
    body: zod_1.z.string(),
    payload: exports.NotificationPayloadSchema,
    isCritical: zod_1.z.boolean(),
    providerMessageId: zod_1.z.string().nullable(),
    attempts: zod_1.z.number().int().nonnegative(),
    lastError: zod_1.z.string().nullable(),
    sentAt: zod_1.z.date().nullable(),
    createdByAdminId: zod_1.z.string().cuid().nullable(),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date(),
});
exports.ListNotificationsQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(100).optional().default(20),
    cursor: zod_1.z.string().cuid().optional(),
    channel: exports.NotificationChannelSchema.optional(),
    status: exports.NotificationStatusSchema.optional(),
});
exports.ListNotificationsResponseSchema = zod_1.z.object({
    notifications: zod_1.z.array(exports.NotificationResponseSchema),
    nextCursor: zod_1.z.string().cuid().nullable(),
    hasMore: zod_1.z.boolean(),
});
exports.MarkNotificationReadSchema = zod_1.z.object({
    notificationId: zod_1.z.string().cuid(),
});
exports.MarkAllNotificationsReadSchema = zod_1.z.object({
    channel: exports.NotificationChannelSchema.optional(),
});
exports.CreateSystemNotificationSchema = zod_1.z.object({
    userId: zod_1.z.string().cuid().optional(),
    event: exports.NotificationEventSchema,
    channel: exports.NotificationChannelSchema.default('IN_APP'),
    title: zod_1.z.string().min(1).max(200),
    body: zod_1.z.string().min(1).max(1000),
    payload: exports.NotificationPayloadSchema,
    isCritical: zod_1.z.boolean().optional().default(false),
});
//# sourceMappingURL=notifications.js.map