/**
 * AI profile recommendation contracts.
 * Source: docs/AI_RECOMMENDATIONS_QUESTIONS.md, client answers 2026-10-14
 * (recorded in docs/decisions/ai-recommendations-2026-10-14.md).
 *
 * A recommendation is a discovery candidate that also shares an interest with
 * the viewer, so the card reuses the discovery projection and adds nothing that
 * discovery withholds. See discovery.ts for the eligibility/scope it inherits.
 */
import { z } from 'zod';
/** Section 41 pagination limits. The cap is server-side; the client cannot raise it. */
export declare const RECOMMENDATION_PAGE_SIZE = 20;
export declare const RECOMMENDATION_MAX_LIMIT = 50;
/** A curated interest, as offered in the picker. */
export declare const InterestOptionSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    sort_order: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    label: string;
    key: string;
    sort_order: number;
}, {
    label: string;
    key: string;
    sort_order: number;
}>;
export type InterestOption = z.infer<typeof InterestOptionSchema>;
/**
 * Replaces a profile's interest selection.
 *
 * Whole-set replacement, like the net-worth visibility lists: the picker submits
 * the complete selection and an empty array is a deliberate "none", which a
 * delta based patch could not express. Membership in the curated catalogue is not
 * enumerated here — that is a data question answered against the `Interest` table
 * — but shape and duplicates are rejected at the edge.
 */
export declare const UpdateInterestsSchema: z.ZodObject<{
    interests: z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>;
}, "strict", z.ZodTypeAny, {
    interests: string[];
}, {
    interests: string[];
}>;
export type UpdateInterestsInput = z.infer<typeof UpdateInterestsSchema>;
/** The caller's selection plus the catalogue, so a picker needs one request. */
export declare const ProfileInterestsSchema: z.ZodObject<{
    selected: z.ZodArray<z.ZodString, "many">;
    available: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        sort_order: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        label: string;
        key: string;
        sort_order: number;
    }, {
        label: string;
        key: string;
        sort_order: number;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    selected: string[];
    available: {
        label: string;
        key: string;
        sort_order: number;
    }[];
}, {
    selected: string[];
    available: {
        label: string;
        key: string;
        sort_order: number;
    }[];
}>;
export type ProfileInterests = z.infer<typeof ProfileInterestsSchema>;
/**
 * A recommendation card.
 *
 * Identical to a discovery card — id, approved photos, a price, always locked —
 * plus the interests the viewer and the candidate share. `shared_interests`
 * exists so answer 4's "reasons shown" is possible without a second request; the
 * UI decision to actually render it is answer 6, and a client may ignore it.
 */
export declare const RecommendationCardSchema: z.ZodObject<{
    profile_id: z.ZodString;
    photos: z.ZodArray<z.ZodObject<{
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
    }>, "many">;
    profile_locked: z.ZodLiteral<true>;
    unlock_price: z.ZodObject<{
        base_amount: z.ZodString;
        gst_rate: z.ZodString;
        gst_amount: z.ZodString;
        total_amount: z.ZodString;
        currency: z.ZodLiteral<"INR">;
    }, "strict", z.ZodTypeAny, {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    }, {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    }>;
    /** Candidate-curated keys the viewer also selected. Overlap count is the score. */
    shared_interests: z.ZodArray<z.ZodString, "many">;
}, "strict", z.ZodTypeAny, {
    profile_id: string;
    photos: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }[];
    profile_locked: true;
    unlock_price: {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    };
    shared_interests: string[];
}, {
    profile_id: string;
    photos: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }[];
    profile_locked: true;
    unlock_price: {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    };
    shared_interests: string[];
}>;
export type RecommendationCard = z.infer<typeof RecommendationCardSchema>;
export declare const RecommendationsQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    limit: number;
}, {
    limit?: number | undefined;
}>;
export type RecommendationsQuery = z.infer<typeof RecommendationsQuerySchema>;
/**
 * The 'For You' response (answer 3: a separate tab; answer 7: feature flag).
 *
 * `enabled` is false when the flag is off. It is a 200 with an empty page rather
 * than a 404 so the client can hide the tab from one flag with no release. When
 * false, no candidate is queried, so no recommendation data is produced.
 *
 * `next_cursor` is always null: scoring orders by shared-interest count, which is
 * not a stable keyset, and the pool is bounded. Pagination is a follow-up once
 * the ordering is proven; the field is present so adding it is not a shape change.
 */
export declare const RecommendationsResponseSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    items: z.ZodArray<z.ZodObject<{
        profile_id: z.ZodString;
        photos: z.ZodArray<z.ZodObject<{
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
        }>, "many">;
        profile_locked: z.ZodLiteral<true>;
        unlock_price: z.ZodObject<{
            base_amount: z.ZodString;
            gst_rate: z.ZodString;
            gst_amount: z.ZodString;
            total_amount: z.ZodString;
            currency: z.ZodLiteral<"INR">;
        }, "strict", z.ZodTypeAny, {
            base_amount: string;
            gst_rate: string;
            gst_amount: string;
            total_amount: string;
            currency: "INR";
        }, {
            base_amount: string;
            gst_rate: string;
            gst_amount: string;
            total_amount: string;
            currency: "INR";
        }>;
        /** Candidate-curated keys the viewer also selected. Overlap count is the score. */
        shared_interests: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        profile_id: string;
        photos: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        }[];
        profile_locked: true;
        unlock_price: {
            base_amount: string;
            gst_rate: string;
            gst_amount: string;
            total_amount: string;
            currency: "INR";
        };
        shared_interests: string[];
    }, {
        profile_id: string;
        photos: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        }[];
        profile_locked: true;
        unlock_price: {
            base_amount: string;
            gst_rate: string;
            gst_amount: string;
            total_amount: string;
            currency: "INR";
        };
        shared_interests: string[];
    }>, "many">;
    /** Bands that were actually searched, after the two-way scope was applied. */
    applied_categories: z.ZodArray<z.ZodString, "many">;
    next_cursor: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    items: {
        profile_id: string;
        photos: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        }[];
        profile_locked: true;
        unlock_price: {
            base_amount: string;
            gst_rate: string;
            gst_amount: string;
            total_amount: string;
            currency: "INR";
        };
        shared_interests: string[];
    }[];
    next_cursor: string | null;
    applied_categories: string[];
    enabled: boolean;
}, {
    items: {
        profile_id: string;
        photos: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        }[];
        profile_locked: true;
        unlock_price: {
            base_amount: string;
            gst_rate: string;
            gst_amount: string;
            total_amount: string;
            currency: "INR";
        };
        shared_interests: string[];
    }[];
    next_cursor: string | null;
    applied_categories: string[];
    enabled: boolean;
}>;
export type RecommendationsResponse = z.infer<typeof RecommendationsResponseSchema>;
//# sourceMappingURL=recommendations.d.ts.map