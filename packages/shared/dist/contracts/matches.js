"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchesResponseSchema = exports.MatchCardSchema = exports.ShortlistStateSchema = exports.ShortlistResultSchema = exports.ShortlistProfileSchema = void 0;
const zod_1 = require("zod");
const profile_js_1 = require("./profile.js");
/** Bookmarks one profile. The id, not the owner's user id — see `BlockProfileSchema`. */
exports.ShortlistProfileSchema = zod_1.z
    .object({
    profile_id: zod_1.z.string().min(1),
})
    .strict();
/**
 * The result of bookmarking, which is the same on a repeat.
 *
 * `shortlisted_at` is the original timestamp on a repeat rather than "now": the
 * member's list is ordered by when they saved someone, and re-tapping must not
 * move a profile to the top of it.
 */
exports.ShortlistResultSchema = zod_1.z
    .object({
    shortlisted: zod_1.z.literal(true),
    shortlisted_at: zod_1.z.string().datetime(),
})
    .strict();
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
exports.ShortlistStateSchema = zod_1.z
    .object({
    profile_id: zod_1.z.string().min(1),
    shortlisted: zod_1.z.boolean(),
    shortlisted_at: zod_1.z.string().datetime().nullable(),
})
    .strict();
/**
 * One row of the Matches list.
 *
 * `display_name` is null unless an unlock is open. A shortlisted profile is
 * identified the way the feed identified it — by its photo — because section 13
 * withholds the name until payment and a bookmark is not a payment.
 */
exports.MatchCardSchema = zod_1.z
    .object({
    profile_id: zod_1.z.string().min(1),
    display_name: zod_1.z.string().nullable(),
    photo: profile_js_1.PreviewPhotoSchema.nullable(),
    is_shortlisted: zod_1.z.boolean(),
    /** True only while an unlock window is open, not merely "was unlocked once". */
    is_unlocked: zod_1.z.boolean(),
    /** Null when the profile is shortlisted only. */
    unlock_status: zod_1.z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']).nullable(),
    unlock_expires_at: zod_1.z.string().datetime().nullable(),
    /** Server-computed, so a device clock cannot show access the server refuses. */
    remaining_ms: zod_1.z.number().int().nonnegative().nullable(),
    shortlisted_at: zod_1.z.string().datetime().nullable(),
})
    .strict();
exports.MatchesResponseSchema = zod_1.z
    .object({
    items: zod_1.z.array(exports.MatchCardSchema),
})
    .strict();
//# sourceMappingURL=matches.js.map