import { z } from 'zod';
/**
 * `NotificationChannel` and `NotificationEvent` are defined once in `enums.ts`
 * and re-exported from the barrel. The schemas here are built FROM those
 * constants rather than re-declaring the unions: two `export type
 * NotificationChannel` declarations across the same barrel collide (TS2308),
 * which is exactly what broke the shared build. Sourcing the zod enum from
 * `NOTIFICATION_CHANNELS`/`NOTIFICATION_EVENTS` keeps the runtime list and the
 * compile-time union impossible to drift apart.
 */
export declare const NotificationChannelSchema: z.ZodEnum<["PUSH", "SMS", "EMAIL", "IN_APP"]>;
/**
 * Delivery states. `SENDING` is a short-lived in-flight claim: a dispatcher
 * flips a `PENDING` row to `SENDING` before it calls the provider, so two
 * workers cannot both send the same notification. A row left `SENDING` by a
 * crashed worker is requeued once it goes stale.
 */
export declare const NotificationStatusSchema: z.ZodEnum<["PENDING", "SENDING", "SENT", "FAILED", "SUPPRESSED"]>;
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;
/** Free-form event key as stored on the row; may be any section-42 string. */
export declare const NotificationEventSchema: z.ZodString;
export declare const NotificationEventEnumSchema: z.ZodNativeEnum<{
    readonly OTP_REQUESTED: "OTP_REQUESTED";
    readonly PROFILE_APPROVED: "PROFILE_APPROVED";
    readonly PROFILE_REJECTED: "PROFILE_REJECTED";
    readonly PAYMENT_SUCCESSFUL: "PAYMENT_SUCCESSFUL";
    readonly UNLOCK_EXPIRING_IN_2H: "UNLOCK_EXPIRING_IN_2H";
    readonly UNLOCK_EXPIRED: "UNLOCK_EXPIRED";
    readonly ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED";
    readonly REPORT_ACTION_TAKEN: "REPORT_ACTION_TAKEN";
    readonly SYSTEM_ANNOUNCEMENT: "SYSTEM_ANNOUNCEMENT";
    readonly IDENTITY_VERIFIED: "IDENTITY_VERIFIED";
    readonly IDENTITY_VERIFICATION_FAILED: "IDENTITY_VERIFICATION_FAILED";
    readonly SETUP_FEE_PAID: "SETUP_FEE_PAID";
    readonly SETUP_FEE_REQUIRED: "SETUP_FEE_REQUIRED";
}>;
export type NotificationEventEnum = z.infer<typeof NotificationEventEnumSchema>;
export declare const NotificationPayloadSchema: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;
export declare const NotificationResponseSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodNullable<z.ZodString>;
    event: z.ZodString;
    channel: z.ZodEnum<["PUSH", "SMS", "EMAIL", "IN_APP"]>;
    status: z.ZodEnum<["PENDING", "SENDING", "SENT", "FAILED", "SUPPRESSED"]>;
    title: z.ZodString;
    body: z.ZodString;
    payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    isCritical: z.ZodBoolean;
    providerMessageId: z.ZodNullable<z.ZodString>;
    attempts: z.ZodNumber;
    lastError: z.ZodNullable<z.ZodString>;
    sentAt: z.ZodNullable<z.ZodDate>;
    createdByAdminId: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "SUPPRESSED";
    id: string;
    userId: string | null;
    event: string;
    channel: "PUSH" | "SMS" | "EMAIL" | "IN_APP";
    title: string;
    body: string;
    isCritical: boolean;
    providerMessageId: string | null;
    attempts: number;
    lastError: string | null;
    sentAt: Date | null;
    createdByAdminId: string | null;
    createdAt: Date;
    updatedAt: Date;
    payload?: Record<string, unknown> | undefined;
}, {
    status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "SUPPRESSED";
    id: string;
    userId: string | null;
    event: string;
    channel: "PUSH" | "SMS" | "EMAIL" | "IN_APP";
    title: string;
    body: string;
    isCritical: boolean;
    providerMessageId: string | null;
    attempts: number;
    lastError: string | null;
    sentAt: Date | null;
    createdByAdminId: string | null;
    createdAt: Date;
    updatedAt: Date;
    payload?: Record<string, unknown> | undefined;
}>;
export type NotificationResponse = z.infer<typeof NotificationResponseSchema>;
export declare const ListNotificationsQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    cursor: z.ZodOptional<z.ZodString>;
    channel: z.ZodOptional<z.ZodEnum<["PUSH", "SMS", "EMAIL", "IN_APP"]>>;
    status: z.ZodOptional<z.ZodEnum<["PENDING", "SENDING", "SENT", "FAILED", "SUPPRESSED"]>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    status?: "PENDING" | "SENDING" | "SENT" | "FAILED" | "SUPPRESSED" | undefined;
    cursor?: string | undefined;
    channel?: "PUSH" | "SMS" | "EMAIL" | "IN_APP" | undefined;
}, {
    status?: "PENDING" | "SENDING" | "SENT" | "FAILED" | "SUPPRESSED" | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
    channel?: "PUSH" | "SMS" | "EMAIL" | "IN_APP" | undefined;
}>;
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;
export declare const ListNotificationsResponseSchema: z.ZodObject<{
    notifications: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodNullable<z.ZodString>;
        event: z.ZodString;
        channel: z.ZodEnum<["PUSH", "SMS", "EMAIL", "IN_APP"]>;
        status: z.ZodEnum<["PENDING", "SENDING", "SENT", "FAILED", "SUPPRESSED"]>;
        title: z.ZodString;
        body: z.ZodString;
        payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        isCritical: z.ZodBoolean;
        providerMessageId: z.ZodNullable<z.ZodString>;
        attempts: z.ZodNumber;
        lastError: z.ZodNullable<z.ZodString>;
        sentAt: z.ZodNullable<z.ZodDate>;
        createdByAdminId: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodDate;
        updatedAt: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "SUPPRESSED";
        id: string;
        userId: string | null;
        event: string;
        channel: "PUSH" | "SMS" | "EMAIL" | "IN_APP";
        title: string;
        body: string;
        isCritical: boolean;
        providerMessageId: string | null;
        attempts: number;
        lastError: string | null;
        sentAt: Date | null;
        createdByAdminId: string | null;
        createdAt: Date;
        updatedAt: Date;
        payload?: Record<string, unknown> | undefined;
    }, {
        status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "SUPPRESSED";
        id: string;
        userId: string | null;
        event: string;
        channel: "PUSH" | "SMS" | "EMAIL" | "IN_APP";
        title: string;
        body: string;
        isCritical: boolean;
        providerMessageId: string | null;
        attempts: number;
        lastError: string | null;
        sentAt: Date | null;
        createdByAdminId: string | null;
        createdAt: Date;
        updatedAt: Date;
        payload?: Record<string, unknown> | undefined;
    }>, "many">;
    nextCursor: z.ZodNullable<z.ZodString>;
    hasMore: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    notifications: {
        status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "SUPPRESSED";
        id: string;
        userId: string | null;
        event: string;
        channel: "PUSH" | "SMS" | "EMAIL" | "IN_APP";
        title: string;
        body: string;
        isCritical: boolean;
        providerMessageId: string | null;
        attempts: number;
        lastError: string | null;
        sentAt: Date | null;
        createdByAdminId: string | null;
        createdAt: Date;
        updatedAt: Date;
        payload?: Record<string, unknown> | undefined;
    }[];
    nextCursor: string | null;
    hasMore: boolean;
}, {
    notifications: {
        status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "SUPPRESSED";
        id: string;
        userId: string | null;
        event: string;
        channel: "PUSH" | "SMS" | "EMAIL" | "IN_APP";
        title: string;
        body: string;
        isCritical: boolean;
        providerMessageId: string | null;
        attempts: number;
        lastError: string | null;
        sentAt: Date | null;
        createdByAdminId: string | null;
        createdAt: Date;
        updatedAt: Date;
        payload?: Record<string, unknown> | undefined;
    }[];
    nextCursor: string | null;
    hasMore: boolean;
}>;
export type ListNotificationsResponse = z.infer<typeof ListNotificationsResponseSchema>;
export declare const MarkNotificationReadSchema: z.ZodObject<{
    notificationId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    notificationId: string;
}, {
    notificationId: string;
}>;
export type MarkNotificationReadRequest = z.infer<typeof MarkNotificationReadSchema>;
export declare const MarkAllNotificationsReadSchema: z.ZodObject<{
    channel: z.ZodOptional<z.ZodEnum<["PUSH", "SMS", "EMAIL", "IN_APP"]>>;
}, "strip", z.ZodTypeAny, {
    channel?: "PUSH" | "SMS" | "EMAIL" | "IN_APP" | undefined;
}, {
    channel?: "PUSH" | "SMS" | "EMAIL" | "IN_APP" | undefined;
}>;
export type MarkAllNotificationsReadRequest = z.infer<typeof MarkAllNotificationsReadSchema>;
export declare const CreateSystemNotificationSchema: z.ZodObject<{
    userId: z.ZodOptional<z.ZodString>;
    event: z.ZodString;
    channel: z.ZodDefault<z.ZodEnum<["PUSH", "SMS", "EMAIL", "IN_APP"]>>;
    title: z.ZodString;
    body: z.ZodString;
    payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    isCritical: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    event: string;
    channel: "PUSH" | "SMS" | "EMAIL" | "IN_APP";
    title: string;
    body: string;
    isCritical: boolean;
    userId?: string | undefined;
    payload?: Record<string, unknown> | undefined;
}, {
    event: string;
    title: string;
    body: string;
    userId?: string | undefined;
    channel?: "PUSH" | "SMS" | "EMAIL" | "IN_APP" | undefined;
    payload?: Record<string, unknown> | undefined;
    isCritical?: boolean | undefined;
}>;
export type CreateSystemNotificationRequest = z.infer<typeof CreateSystemNotificationSchema>;
//# sourceMappingURL=notifications.d.ts.map