import { z } from 'zod';
import { DEVICE_PLATFORMS } from '../enums.js';

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
export const DevicePlatformSchema = z.enum(DEVICE_PLATFORMS);

export const RegisterDeviceTokenSchema = z
  .object({
    /** FCM registration token. Long, opaque, and case-sensitive. */
    token: z.string().min(1).max(4096),
    platform: DevicePlatformSchema,
    /** App-supplied stable id, so a reinstall can replace its previous token. */
    device_id: z.string().min(1).max(128).optional(),
  })
  .strict();
export type RegisterDeviceTokenRequest = z.infer<typeof RegisterDeviceTokenSchema>;

export const DeviceTokenResponseSchema = z.object({
  id: z.string().cuid(),
  platform: DevicePlatformSchema,
  device_id: z.string().nullable(),
  last_seen_at: z.date(),
  created_at: z.date(),
});
export type DeviceTokenResponse = z.infer<typeof DeviceTokenResponseSchema>;

export const DeviceTokenListResponseSchema = z.object({
  devices: z.array(DeviceTokenResponseSchema),
});
export type DeviceTokenListResponse = z.infer<typeof DeviceTokenListResponseSchema>;
