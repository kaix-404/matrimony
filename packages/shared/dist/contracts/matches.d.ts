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
/** Bookmarks one profile. The id, not the owner's user id — see `BlockProfileSchema`. */
export declare const ShortlistProfileSchema: z.ZodObject<{
    profile_id: z.ZodString;
}, "strict", z.ZodTypeAny, {
    profile_id: string;
}, {
    profile_id: string;
}>;
export type ShortlistProfileRequest = z.infer<typeof ShortlistProfileSchema>;
/**
 * The result of bookmarking, which is the same on a repeat.
 *
 * `shortlisted_at` is the original timestamp on a repeat rather than "now": the
 * member's list is ordered by when they saved someone, and re-tapping must not
 * move a profile to the top of it.
 */
export declare const ShortlistResultSchema: z.ZodObject<{
    shortlisted: z.ZodLiteral<true>;
    shortlisted_at: z.ZodString;
}, "strict", z.ZodTypeAny, {
    shortlisted: true;
    shortlisted_at: string;
}, {
    shortlisted: true;
    shortlisted_at: string;
}>;
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
export declare const ShortlistStateSchema: z.ZodObject<{
    profile_id: z.ZodString;
    shortlisted: z.ZodBoolean;
    shortlisted_at: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    profile_id: string;
    shortlisted: boolean;
    shortlisted_at: string | null;
}, {
    profile_id: string;
    shortlisted: boolean;
    shortlisted_at: string | null;
}>;
export type ShortlistState = z.infer<typeof ShortlistStateSchema>;
/**
 * One saved profile, with nothing about the profile itself.
 *
 * Deliberately not a card: the feed already has its cards and only needs to know
 * which of them are bookmarked, so this carries ids and timestamps and nothing
 * that would have to be presigned.
 */
export declare const ShortlistEntrySchema: z.ZodObject<{
    profile_id: z.ZodString;
    shortlisted_at: z.ZodString;
}, "strict", z.ZodTypeAny, {
    profile_id: string;
    shortlisted_at: string;
}, {
    profile_id: string;
    shortlisted_at: string;
}>;
export type ShortlistEntry = z.infer<typeof ShortlistEntrySchema>;
/**
 * The caller's whole shortlist, newest first.
 *
 * Bounded by effort — a member saves profiles one deliberate tap at a time — so
 * there is no cursor. The feed reads it once per load to fill its bookmark icons,
 * which is why it stays this small.
 */
export declare const ShortlistIndexSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        profile_id: z.ZodString;
        shortlisted_at: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        profile_id: string;
        shortlisted_at: string;
    }, {
        profile_id: string;
        shortlisted_at: string;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    items: {
        profile_id: string;
        shortlisted_at: string;
    }[];
}, {
    items: {
        profile_id: string;
        shortlisted_at: string;
    }[];
}>;
export type ShortlistIndex = z.infer<typeof ShortlistIndexSchema>;
/**
 * One row of the Matches list.
 *
 * `display_name` is null unless an unlock is open. A shortlisted profile is
 * identified the way the feed identified it — by its photo — because section 13
 * withholds the name until payment and a bookmark is not a payment.
 */
export declare const MatchCardSchema: z.ZodObject<{
    profile_id: z.ZodString;
    display_name: z.ZodNullable<z.ZodString>;
    photo: z.ZodNullable<z.ZodObject<{
        photo_id: z.ZodString;
        url: z.ZodString;
        width_px: z.ZodNullable<z.ZodNumber>;
        height_px: z.ZodNullable<z.ZodNumber>;
        is_primary: z.ZodBoolean;
        photo_type: z.ZodEnum<["SINGLE", "FAMILY"]>;
    }, "strict", z.ZodTypeAny, {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }, {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }>>;
    is_shortlisted: z.ZodBoolean;
    /** True only while an unlock window is open, not merely "was unlocked once". */
    is_unlocked: z.ZodBoolean;
    /** Null when the profile is shortlisted only. */
    unlock_status: z.ZodNullable<z.ZodEnum<["ACTIVE", "EXPIRED", "REVOKED"]>>;
    unlock_expires_at: z.ZodNullable<z.ZodString>;
    /** Server-computed, so a device clock cannot show access the server refuses. */
    remaining_ms: z.ZodNullable<z.ZodNumber>;
    shortlisted_at: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    profile_id: string;
    unlock_expires_at: string | null;
    display_name: string | null;
    photo: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    } | null;
    remaining_ms: number | null;
    shortlisted_at: string | null;
    is_shortlisted: boolean;
    is_unlocked: boolean;
    unlock_status: "ACTIVE" | "EXPIRED" | "REVOKED" | null;
}, {
    profile_id: string;
    unlock_expires_at: string | null;
    display_name: string | null;
    photo: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    } | null;
    remaining_ms: number | null;
    shortlisted_at: string | null;
    is_shortlisted: boolean;
    is_unlocked: boolean;
    unlock_status: "ACTIVE" | "EXPIRED" | "REVOKED" | null;
}>;
export type MatchCard = z.infer<typeof MatchCardSchema>;
export declare const MatchesResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        profile_id: z.ZodString;
        display_name: z.ZodNullable<z.ZodString>;
        photo: z.ZodNullable<z.ZodObject<{
            photo_id: z.ZodString;
            url: z.ZodString;
            width_px: z.ZodNullable<z.ZodNumber>;
            height_px: z.ZodNullable<z.ZodNumber>;
            is_primary: z.ZodBoolean;
            photo_type: z.ZodEnum<["SINGLE", "FAMILY"]>;
        }, "strict", z.ZodTypeAny, {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        }, {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        }>>;
        is_shortlisted: z.ZodBoolean;
        /** True only while an unlock window is open, not merely "was unlocked once". */
        is_unlocked: z.ZodBoolean;
        /** Null when the profile is shortlisted only. */
        unlock_status: z.ZodNullable<z.ZodEnum<["ACTIVE", "EXPIRED", "REVOKED"]>>;
        unlock_expires_at: z.ZodNullable<z.ZodString>;
        /** Server-computed, so a device clock cannot show access the server refuses. */
        remaining_ms: z.ZodNullable<z.ZodNumber>;
        shortlisted_at: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        profile_id: string;
        unlock_expires_at: string | null;
        display_name: string | null;
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        remaining_ms: number | null;
        shortlisted_at: string | null;
        is_shortlisted: boolean;
        is_unlocked: boolean;
        unlock_status: "ACTIVE" | "EXPIRED" | "REVOKED" | null;
    }, {
        profile_id: string;
        unlock_expires_at: string | null;
        display_name: string | null;
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        remaining_ms: number | null;
        shortlisted_at: string | null;
        is_shortlisted: boolean;
        is_unlocked: boolean;
        unlock_status: "ACTIVE" | "EXPIRED" | "REVOKED" | null;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    items: {
        profile_id: string;
        unlock_expires_at: string | null;
        display_name: string | null;
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        remaining_ms: number | null;
        shortlisted_at: string | null;
        is_shortlisted: boolean;
        is_unlocked: boolean;
        unlock_status: "ACTIVE" | "EXPIRED" | "REVOKED" | null;
    }[];
}, {
    items: {
        profile_id: string;
        unlock_expires_at: string | null;
        display_name: string | null;
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        remaining_ms: number | null;
        shortlisted_at: string | null;
        is_shortlisted: boolean;
        is_unlocked: boolean;
        unlock_status: "ACTIVE" | "EXPIRED" | "REVOKED" | null;
    }[];
}>;
export type MatchesResponse = z.infer<typeof MatchesResponseSchema>;
//# sourceMappingURL=matches.d.ts.map