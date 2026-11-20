import { z } from 'zod';
import { PHOTO_TYPES } from '@matrimony/shared';

/**
 * Photo upload contracts.
 *
 * Kept here rather than in the shared package: nothing else consumes them, and
 * the shared package is the app's contract, so an upload handshake only the API
 * speaks does not belong in it.
 */

/**
 * The client declares the type it is about to send.
 *
 * `photo_type` is explicit because D1 accepts both single-person and family
 * group photos, and a family photo may contain several faces. Automatic
 * screening cannot assume one face per image, so the distinction has to survive
 * to the moderation worker rather than being inferred later.
 */
export const InitiatePhotoUploadSchema = z
  .object({
    mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    byte_size: z
      .number()
      .int()
      .positive()
      .max(5 * 1024 * 1024),
    photo_type: z.enum(PHOTO_TYPES),
  })
  .strict();

export type InitiatePhotoUploadInput = z.infer<typeof InitiatePhotoUploadSchema>;

/**
 * The client confirms the upload and reports what it actually wrote.
 *
 * `width_px`/`height_px` come from the client because the API never sees the
 * bytes. They are bounded rather than trusted: a card that renders `width_px`
 * without checking would allocate a canvas the size of whatever arrived.
 */
export const CompletePhotoUploadSchema = z
  .object({
    object_key: z.string().min(1).max(512),
    width_px: z.number().int().positive().max(20_000),
    height_px: z.number().int().positive().max(20_000),
    checksum: z.string().min(32).max(128).optional(),
  })
  .strict();

export type CompletePhotoUploadInput = z.infer<typeof CompletePhotoUploadSchema>;

export const SetVisibilitySchema = z
  .object({
    visibility: z.enum(['ACTIVE', 'PAUSED']),
  })
  .strict();

export type SetVisibilityInput = z.infer<typeof SetVisibilitySchema>;
