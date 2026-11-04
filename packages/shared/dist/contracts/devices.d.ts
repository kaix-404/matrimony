import { z } from 'zod';
/**
 * Push device registration (section 42, client decision 2026-10-01: Firebase).
 *
 * A registration token is opaque and issued by the device, never by us, so it is
 * validated only for shape and length; the authority on whether it is live is
 * FCM, and a token it reports as unregistered is pruned on the first send that
 * fails with `UNREGISTERED`.
 *
 * The token is the device's own secret, so it is never echoed back in a response
 * body — a response cannot leak a token it does not carry, and access logs stay
 * free of it.
 */
export declare const DevicePlatformSchema: z.ZodEnum<["ANDROID", "IOS", "WEB"]>;
export declare const RegisterDeviceTokenSchema: z.ZodObject<{
    /** FCM registration token. Long, opaque, and case-sensitive. */
    token: z.ZodString;
    platform: z.ZodEnum<["ANDROID", "IOS", "WEB"]>;
    /** App-supplied stable id, so a reinstall can replace its previous token. */
    device_id: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    token: string;
    platform: "ANDROID" | "IOS" | "WEB";
    device_id?: string | undefined;
}, {
    token: string;
    platform: "ANDROID" | "IOS" | "WEB";
    device_id?: string | undefined;
}>;
export type RegisterDeviceTokenRequest = z.infer<typeof RegisterDeviceTokenSchema>;
export declare const DeviceTokenResponseSchema: z.ZodObject<{
    id: z.ZodString;
    platform: z.ZodEnum<["ANDROID", "IOS", "WEB"]>;
    device_id: z.ZodNullable<z.ZodString>;
    last_seen_at: z.ZodDate;
    created_at: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    device_id: string | null;
    platform: "ANDROID" | "IOS" | "WEB";
    last_seen_at: Date;
    created_at: Date;
}, {
    id: string;
    device_id: string | null;
    platform: "ANDROID" | "IOS" | "WEB";
    last_seen_at: Date;
    created_at: Date;
}>;
export type DeviceTokenResponse = z.infer<typeof DeviceTokenResponseSchema>;
export declare const DeviceTokenListResponseSchema: z.ZodObject<{
    devices: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        platform: z.ZodEnum<["ANDROID", "IOS", "WEB"]>;
        device_id: z.ZodNullable<z.ZodString>;
        last_seen_at: z.ZodDate;
        created_at: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        id: string;
        device_id: string | null;
        platform: "ANDROID" | "IOS" | "WEB";
        last_seen_at: Date;
        created_at: Date;
    }, {
        id: string;
        device_id: string | null;
        platform: "ANDROID" | "IOS" | "WEB";
        last_seen_at: Date;
        created_at: Date;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    devices: {
        id: string;
        device_id: string | null;
        platform: "ANDROID" | "IOS" | "WEB";
        last_seen_at: Date;
        created_at: Date;
    }[];
}, {
    devices: {
        id: string;
        device_id: string | null;
        platform: "ANDROID" | "IOS" | "WEB";
        last_seen_at: Date;
        created_at: Date;
    }[];
}>;
export type DeviceTokenListResponse = z.infer<typeof DeviceTokenListResponseSchema>;
//# sourceMappingURL=devices.d.ts.map