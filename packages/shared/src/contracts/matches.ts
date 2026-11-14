/**
 * Matches: the profiles a member has shortlisted and the ones they have
 * unlocked, as one list.
 *
 * Shortlisting is a private bookmark, not a payment and not a mutual signal: it
 * is the caller's own list, it is never shown to the profile it names, and it
 * exists so a member can come back to someone without buying contact first. That
 * is why nothing here reveals a name unless an unlock — a paid one, or an admin
 * grant — is currently open. The card only ever carries what the free preview
 * already showed, which is one photo.
 *
 * Every contract is `.strict()`, matching the rest of the package: a card that
 * quietly grows a field is how a locked profile's name leaks into a list.
 */

import { z } from 'zod';
import { PreviewPhotoSchema } from './profile.js';

/** Bookmarks one profile. The id, not the owner's user id — see `BlockProfileSchema`. */
export const ShortlistProfileSchema = z
  .object({
    profile_id: z.string().min(1),
  })
  .strict();

export type ShortlistProfileRequest = z.infer<typeof ShortlistProfileSchema>;

/**
 * The result of bookmarking, which is the same on a repeat.
 *
 * `shortlisted_at` is the original timestamp on a repeat rather than "now": the
 * member's list is ordered by when they saved someone, and re-tapping must not
 * move a profile to the top of it.
 */
export const ShortlistResultSchema = z
  .object({
    shortlisted: z.literal(true),
    shortlisted_at: z.string().datetime(),
  })
  .strict();

export type ShortlistResult = z.infer<typeof ShortlistResultSchema>;

/**
 * One row of the Matches list.
 *
 * `display_name` is null unless an unlock is open. A shortlisted profile is
 * identified the way the feed identified it — by its photo — because section 13
 * withholds the name until payment and a bookmark is not a payment.
 */
export const MatchCardSchema = z
  .object({
    profile_id: z.string().min(1),
    display_name: z.string().nullable(),
    photo: PreviewPhotoSchema.nullable(),
    is_shortlisted: z.boolean(),
    /** True only while an unlock window is open, not merely "was unlocked once". */
    is_unlocked: z.boolean(),
    /** Null when the profile is shortlisted only. */
    unlock_status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']).nullable(),
    unlock_expires_at: z.string().datetime().nullable(),
    /** Server-computed, so a device clock cannot show access the server refuses. */
    remaining_ms: z.number().int().nonnegative().nullable(),
    shortlisted_at: z.string().datetime().nullable(),
  })
  .strict();

export type MatchCard = z.infer<typeof MatchCardSchema>;

export const MatchesResponseSchema = z
  .object({
    items: z.array(MatchCardSchema),
  })
  .strict();

export type MatchesResponse = z.infer<typeof MatchesResponseSchema>;
