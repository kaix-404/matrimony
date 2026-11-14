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
    shortlisted_at: string | null;
    display_name: string | null;
    photo: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    } | null;
    is_shortlisted: boolean;
    is_unlocked: boolean;
    unlock_status: "ACTIVE" | "EXPIRED" | "REVOKED" | null;
    unlock_expires_at: string | null;
    remaining_ms: number | null;
}, {
    profile_id: string;
    shortlisted_at: string | null;
    display_name: string | null;
    photo: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    } | null;
    is_shortlisted: boolean;
    is_unlocked: boolean;
    unlock_status: "ACTIVE" | "EXPIRED" | "REVOKED" | null;
    unlock_expires_at: string | null;
    remaining_ms: number | null;
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
        shortlisted_at: string | null;
        display_name: string | null;
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        is_shortlisted: boolean;
        is_unlocked: boolean;
        unlock_status: "ACTIVE" | "EXPIRED" | "REVOKED" | null;
        unlock_expires_at: string | null;
        remaining_ms: number | null;
    }, {
        profile_id: string;
        shortlisted_at: string | null;
        display_name: string | null;
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        is_shortlisted: boolean;
        is_unlocked: boolean;
        unlock_status: "ACTIVE" | "EXPIRED" | "REVOKED" | null;
        unlock_expires_at: string | null;
        remaining_ms: number | null;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    items: {
        profile_id: string;
        shortlisted_at: string | null;
        display_name: string | null;
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        is_shortlisted: boolean;
        is_unlocked: boolean;
        unlock_status: "ACTIVE" | "EXPIRED" | "REVOKED" | null;
        unlock_expires_at: string | null;
        remaining_ms: number | null;
    }[];
}, {
    items: {
        profile_id: string;
        shortlisted_at: string | null;
        display_name: string | null;
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        is_shortlisted: boolean;
        is_unlocked: boolean;
        unlock_status: "ACTIVE" | "EXPIRED" | "REVOKED" | null;
        unlock_expires_at: string | null;
        remaining_ms: number | null;
    }[];
}>;
export type MatchesResponse = z.infer<typeof MatchesResponseSchema>;
//# sourceMappingURL=matches.d.ts.map