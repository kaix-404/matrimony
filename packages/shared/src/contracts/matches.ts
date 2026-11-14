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
 * Whether one profile is bookmarked, for the button on its page.
 *
 * Its own route rather than a field on the profile view. The view's payload is
 * the spec's section 13 / 39 disclosure set, and a contract test pins its exact
 * keys so a profile field cannot be smuggled in — caller state does not belong in
 * it. It is also cheaper than the alternative the app started with, which was to
 * download the Matches list (and presign a photo for every saved profile) to
 * learn one boolean.
 */
export const ShortlistStateSchema = z
  .object({
    profile_id: z.string().min(1),
    shortlisted: z.boolean(),
    shortlisted_at: z.string().datetime().nullable(),
  })
  .strict();

export type ShortlistState = z.infer<typeof ShortlistStateSchema>;

/**
 * One saved profile, with nothing about the profile itself.
 *
 * Deliberately not a card: the feed already has its cards and only needs to know
 * which of them are bookmarked, so this carries ids and timestamps and nothing
 * that would have to be presigned.
 */
export const ShortlistEntrySchema = z
  .object({
    profile_id: z.string().min(1),
    shortlisted_at: z.string().datetime(),
  })
  .strict();

export type ShortlistEntry = z.infer<typeof ShortlistEntrySchema>;

/**
 * The caller's whole shortlist, newest first.
 *
 * Bounded by effort — a member saves profiles one deliberate tap at a time — so
 * there is no cursor. The feed reads it once per load to fill its bookmark icons,
 * which is why it stays this small.
 */
export const ShortlistIndexSchema = z
  .object({
    items: z.array(ShortlistEntrySchema),
  })
  .strict();

export type ShortlistIndex = z.infer<typeof ShortlistIndexSchema>;

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
