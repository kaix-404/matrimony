"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceTokenListResponseSchema = exports.DeviceTokenResponseSchema = exports.RegisterDeviceTokenSchema = exports.DevicePlatformSchema = void 0;
const zod_1 = require("zod");
const enums_js_1 = require("../enums.js");
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
exports.DevicePlatformSchema = zod_1.z.enum(enums_js_1.DEVICE_PLATFORMS);
exports.RegisterDeviceTokenSchema = zod_1.z
    .object({
    /** FCM registration token. Long, opaque, and case-sensitive. */
    token: zod_1.z.string().min(1).max(4096),
    platform: exports.DevicePlatformSchema,
    /** App-supplied stable id, so a reinstall can replace its previous token. */
    device_id: zod_1.z.string().min(1).max(128).optional(),
})
    .strict();
exports.DeviceTokenResponseSchema = zod_1.z.object({
    id: zod_1.z.string().cuid(),
    platform: exports.DevicePlatformSchema,
    device_id: zod_1.z.string().nullable(),
    last_seen_at: zod_1.z.date(),
    created_at: zod_1.z.date(),
});
exports.DeviceTokenListResponseSchema = zod_1.z.object({
    devices: zod_1.z.array(exports.DeviceTokenResponseSchema),
});
//# sourceMappingURL=devices.js.map