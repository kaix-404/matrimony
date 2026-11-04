/**
 * Discovery, preference and unlock-list contracts.
 * Spec sections 10, 12, 16, 18.
 */
import { z } from 'zod';
export declare const PartnerPreferenceSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    id: z.ZodString;
    gender: z.ZodEnum<["MALE", "FEMALE", "ANY"]>;
    age_min: z.ZodNullable<z.ZodNumber>;
    age_max: z.ZodNullable<z.ZodNumber>;
    height_min_cm: z.ZodNullable<z.ZodNumber>;
    height_max_cm: z.ZodNullable<z.ZodNumber>;
    preferred_country: z.ZodNullable<z.ZodString>;
    preferred_state: z.ZodNullable<z.ZodString>;
    preferred_city: z.ZodNullable<z.ZodString>;
    education: z.ZodNullable<z.ZodString>;
    profession: z.ZodNullable<z.ZodString>;
    marital_status: z.ZodNullable<z.ZodString>;
    religion: z.ZodNullable<z.ZodString>;
    community: z.ZodNullable<z.ZodString>;
    mother_tongue: z.ZodNullable<z.ZodString>;
    annual_income: z.ZodNullable<z.ZodString>;
    rashi: z.ZodNullable<z.ZodString>;
    nakshatra: z.ZodNullable<z.ZodString>;
    manglik_status: z.ZodNullable<z.ZodString>;
    updated_at: z.ZodString;
}, "strict", z.ZodTypeAny, {
    gender: "FEMALE" | "MALE" | "ANY";
    marital_status: string | null;
    religion: string | null;
    community: string | null;
    mother_tongue: string | null;
    rashi: string | null;
    nakshatra: string | null;
    manglik_status: string | null;
    education: string | null;
    profession: string | null;
    annual_income: string | null;
    id: string;
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    preferred_country: string | null;
    preferred_state: string | null;
    preferred_city: string | null;
    updated_at: string;
}, {
    gender: "FEMALE" | "MALE" | "ANY";
    marital_status: string | null;
    religion: string | null;
    community: string | null;
    mother_tongue: string | null;
    rashi: string | null;
    nakshatra: string | null;
    manglik_status: string | null;
    education: string | null;
    profession: string | null;
    annual_income: string | null;
    id: string;
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    preferred_country: string | null;
    preferred_state: string | null;
    preferred_city: string | null;
    updated_at: string;
}>, {
    gender: "FEMALE" | "MALE" | "ANY";
    marital_status: string | null;
    religion: string | null;
    community: string | null;
    mother_tongue: string | null;
    rashi: string | null;
    nakshatra: string | null;
    manglik_status: string | null;
    education: string | null;
    profession: string | null;
    annual_income: string | null;
    id: string;
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    preferred_country: string | null;
    preferred_state: string | null;
    preferred_city: string | null;
    updated_at: string;
}, {
    gender: "FEMALE" | "MALE" | "ANY";
    marital_status: string | null;
    religion: string | null;
    community: string | null;
    mother_tongue: string | null;
    rashi: string | null;
    nakshatra: string | null;
    manglik_status: string | null;
    education: string | null;
    profession: string | null;
    annual_income: string | null;
    id: string;
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    preferred_country: string | null;
    preferred_state: string | null;
    preferred_city: string | null;
    updated_at: string;
}>, {
    gender: "FEMALE" | "MALE" | "ANY";
    marital_status: string | null;
    religion: string | null;
    community: string | null;
    mother_tongue: string | null;
    rashi: string | null;
    nakshatra: string | null;
    manglik_status: string | null;
    education: string | null;
    profession: string | null;
    annual_income: string | null;
    id: string;
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    preferred_country: string | null;
    preferred_state: string | null;
    preferred_city: string | null;
    updated_at: string;
}, {
    gender: "FEMALE" | "MALE" | "ANY";
    marital_status: string | null;
    religion: string | null;
    community: string | null;
    mother_tongue: string | null;
    rashi: string | null;
    nakshatra: string | null;
    manglik_status: string | null;
    education: string | null;
    profession: string | null;
    annual_income: string | null;
    id: string;
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    preferred_country: string | null;
    preferred_state: string | null;
    preferred_city: string | null;
    updated_at: string;
}>;
export type PartnerPreference = z.infer<typeof PartnerPreferenceSchema>;
/**
 * Section 10: "Temporary filters can be applied without overwriting saved
 * preferences." These live only in the request, never in a persisted row.
 */
export declare const TemporaryFilterSchema: z.ZodEffects<z.ZodObject<{
    age_min: z.ZodOptional<z.ZodNumber>;
    age_max: z.ZodOptional<z.ZodNumber>;
    height_min_cm: z.ZodOptional<z.ZodNumber>;
    height_max_cm: z.ZodOptional<z.ZodNumber>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    education: z.ZodOptional<z.ZodString>;
    profession: z.ZodOptional<z.ZodString>;
    income_min: z.ZodOptional<z.ZodNumber>;
    verified_photos_only: z.ZodOptional<z.ZodEffects<z.ZodUnion<[z.ZodBoolean, z.ZodEnum<["true", "false"]>]>, boolean, boolean | "true" | "false">>;
}, "strict", z.ZodTypeAny, {
    education?: string | undefined;
    profession?: string | undefined;
    state?: string | undefined;
    city?: string | undefined;
    age_min?: number | undefined;
    age_max?: number | undefined;
    height_min_cm?: number | undefined;
    height_max_cm?: number | undefined;
    income_min?: number | undefined;
    verified_photos_only?: boolean | undefined;
}, {
    education?: string | undefined;
    profession?: string | undefined;
    state?: string | undefined;
    city?: string | undefined;
    age_min?: number | undefined;
    age_max?: number | undefined;
    height_min_cm?: number | undefined;
    height_max_cm?: number | undefined;
    income_min?: number | undefined;
    verified_photos_only?: boolean | "true" | "false" | undefined;
}>, {
    education?: string | undefined;
    profession?: string | undefined;
    state?: string | undefined;
    city?: string | undefined;
    age_min?: number | undefined;
    age_max?: number | undefined;
    height_min_cm?: number | undefined;
    height_max_cm?: number | undefined;
    income_min?: number | undefined;
    verified_photos_only?: boolean | undefined;
}, {
    education?: string | undefined;
    profession?: string | undefined;
    state?: string | undefined;
    city?: string | undefined;
    age_min?: number | undefined;
    age_max?: number | undefined;
    height_min_cm?: number | undefined;
    height_max_cm?: number | undefined;
    income_min?: number | undefined;
    verified_photos_only?: boolean | "true" | "false" | undefined;
}>;
export type TemporaryFilter = z.infer<typeof TemporaryFilterSchema>;
/**
 * Section 41 requires pagination limits, and section 12 requires infinite
 * scrolling. The cap is enforced server-side; the client cannot raise it.
 */
export declare const DISCOVERY_PAGE_SIZE = 20;
export declare const DISCOVERY_MAX_LIMIT = 50;
/**
 * A discovery card. Note what is absent: no name, no contact, no income, no
 * religion. Section 12: "Search response must not include locked fields."
 */
export declare const DiscoveryCardSchema: z.ZodObject<{
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
}>;
export type DiscoveryCard = z.infer<typeof DiscoveryCardSchema>;
/**
 * Section 12: "Profile IDs must not allow unauthorized cross-category access."
 * The response echoes the applied scope so a client bug that drops the filter
 * is detectable, and so tests can assert category isolation.
 */
export declare const DiscoveryResponseSchema: z.ZodObject<{
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
    }>, "many">;
    next_cursor: z.ZodNullable<z.ZodString>;
    /**
     * The bands actually searched, after both sides of the two-way rule were
     * applied. Every item is guaranteed to fall inside this list.
     *
     * Was a single `applied_category`: the old model made net-worth a partition
     * key, so the scope was always the caller's own band. Cross-band discovery is
     * now possible, so the scope is the intersection the server derived from the
     * caller's saved preferences — never from a request parameter. Echoing it
     * keeps the guarantee checkable: if an item's band is not in this list, the
     * query is wrong.
     */
    applied_categories: z.ZodArray<z.ZodString, "many">;
    /** Always true in practice; see `use_saved_preference` below. */
    preference_applied: z.ZodBoolean;
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
    }[];
    next_cursor: string | null;
    applied_categories: string[];
    preference_applied: boolean;
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
    }[];
    next_cursor: string | null;
    applied_categories: string[];
    preference_applied: boolean;
}>;
export type DiscoveryResponse = z.infer<typeof DiscoveryResponseSchema>;
/**
 * E2 answered "newest and closest profile first", which is two orderings and
 * does not state which takes precedence. See docs/decisions GAP-3.
 *
 * Implemented as newest-registered first, broken by location proximity, because
 * that is the literal reading of "newest ... first". This is provisional: the
 * order is expressed as an enum precisely so the default can be changed without
 * a contract change once the client confirms the precedence.
 */
export declare const DISCOVERY_SORTS: readonly ["NEWEST_FIRST", "CLOSEST_FIRST", "NEWEST_THEN_CLOSEST"];
export type DiscoverySort = (typeof DISCOVERY_SORTS)[number];
export declare const DiscoveryQuerySchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
    /** Section 10: temporary filters narrow, never replace, the saved preference. */
    filters: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        age_min: z.ZodOptional<z.ZodNumber>;
        age_max: z.ZodOptional<z.ZodNumber>;
        height_min_cm: z.ZodOptional<z.ZodNumber>;
        height_max_cm: z.ZodOptional<z.ZodNumber>;
        city: z.ZodOptional<z.ZodString>;
        state: z.ZodOptional<z.ZodString>;
        education: z.ZodOptional<z.ZodString>;
        profession: z.ZodOptional<z.ZodString>;
        income_min: z.ZodOptional<z.ZodNumber>;
        verified_photos_only: z.ZodOptional<z.ZodEffects<z.ZodUnion<[z.ZodBoolean, z.ZodEnum<["true", "false"]>]>, boolean, boolean | "true" | "false">>;
    }, "strict", z.ZodTypeAny, {
        education?: string | undefined;
        profession?: string | undefined;
        state?: string | undefined;
        city?: string | undefined;
        age_min?: number | undefined;
        age_max?: number | undefined;
        height_min_cm?: number | undefined;
        height_max_cm?: number | undefined;
        income_min?: number | undefined;
        verified_photos_only?: boolean | undefined;
    }, {
        education?: string | undefined;
        profession?: string | undefined;
        state?: string | undefined;
        city?: string | undefined;
        age_min?: number | undefined;
        age_max?: number | undefined;
        height_min_cm?: number | undefined;
        height_max_cm?: number | undefined;
        income_min?: number | undefined;
        verified_photos_only?: boolean | "true" | "false" | undefined;
    }>, {
        education?: string | undefined;
        profession?: string | undefined;
        state?: string | undefined;
        city?: string | undefined;
        age_min?: number | undefined;
        age_max?: number | undefined;
        height_min_cm?: number | undefined;
        height_max_cm?: number | undefined;
        income_min?: number | undefined;
        verified_photos_only?: boolean | undefined;
    }, {
        education?: string | undefined;
        profession?: string | undefined;
        state?: string | undefined;
        city?: string | undefined;
        age_min?: number | undefined;
        age_max?: number | undefined;
        height_min_cm?: number | undefined;
        height_max_cm?: number | undefined;
        income_min?: number | undefined;
        verified_photos_only?: boolean | "true" | "false" | undefined;
    }>>;
    /** Section 10: "Reset to Partner Preference". */
    /**
     * Accepted for compatibility and deliberately not a scope override.
     *
     * Section 10's reset clears *temporary filters*, not the saved preference, and
     * a per-request category is rejected above precisely so a client cannot widen
     * the band it searches. Honouring `false` as "ignore my saved preference"
     * would reintroduce exactly that bypass, so the scope is always the saved
     * preference with temporary filters narrowing it, and `preference_applied` is
     * always true.
     */
    use_saved_preference: z.ZodDefault<z.ZodEffects<z.ZodUnion<[z.ZodBoolean, z.ZodEnum<["true", "false"]>]>, boolean, boolean | "true" | "false">>;
    sort: z.ZodDefault<z.ZodEnum<["NEWEST_FIRST", "CLOSEST_FIRST", "NEWEST_THEN_CLOSEST"]>>;
}, "strict", z.ZodTypeAny, {
    sort: "NEWEST_FIRST" | "CLOSEST_FIRST" | "NEWEST_THEN_CLOSEST";
    limit: number;
    use_saved_preference: boolean;
    cursor?: string | undefined;
    filters?: {
        education?: string | undefined;
        profession?: string | undefined;
        state?: string | undefined;
        city?: string | undefined;
        age_min?: number | undefined;
        age_max?: number | undefined;
        height_min_cm?: number | undefined;
        height_max_cm?: number | undefined;
        income_min?: number | undefined;
        verified_photos_only?: boolean | undefined;
    } | undefined;
}, {
    sort?: "NEWEST_FIRST" | "CLOSEST_FIRST" | "NEWEST_THEN_CLOSEST" | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
    filters?: {
        education?: string | undefined;
        profession?: string | undefined;
        state?: string | undefined;
        city?: string | undefined;
        age_min?: number | undefined;
        age_max?: number | undefined;
        height_min_cm?: number | undefined;
        height_max_cm?: number | undefined;
        income_min?: number | undefined;
        verified_photos_only?: boolean | "true" | "false" | undefined;
    } | undefined;
    use_saved_preference?: boolean | "true" | "false" | undefined;
}>;
export type DiscoveryQuery = z.infer<typeof DiscoveryQuerySchema>;
export declare const ActiveUnlockSchema: z.ZodObject<{
    unlock_id: z.ZodString;
    profile_id: z.ZodString;
    /** Section 16: "Profile identifier/name as permitted after unlock". */
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
    unlocked_at: z.ZodString;
    unlock_expires_at: z.ZodString;
    remaining_ms: z.ZodNumber;
    is_expired: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    photo: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    } | null;
    profile_id: string;
    unlock_id: string;
    display_name: string | null;
    unlocked_at: string;
    unlock_expires_at: string;
    remaining_ms: number;
    is_expired: boolean;
}, {
    photo: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    } | null;
    profile_id: string;
    unlock_id: string;
    display_name: string | null;
    unlocked_at: string;
    unlock_expires_at: string;
    remaining_ms: number;
    is_expired: boolean;
}>;
export type ActiveUnlock = z.infer<typeof ActiveUnlockSchema>;
export declare const PaymentHistoryEntrySchema: z.ZodObject<{
    payment_id: z.ZodString;
    /**
     * D9 added the ₹15 account setup fee as a second kind of charge, so a
     * payment row can no longer be assumed to relate to a profile. B5 removed
     * "view refund status", which is why there is no refund-state field here.
     */
    purpose: z.ZodEnum<["UNLOCK", "SETUP_FEE"]>;
    transaction_at: z.ZodString;
    profile_id: z.ZodNullable<z.ZodString>;
    base_amount: z.ZodString;
    gst_amount: z.ZodString;
    total_amount: z.ZodString;
    currency: z.ZodLiteral<"INR">;
    status: z.ZodString;
    unlock_start: z.ZodNullable<z.ZodString>;
    unlock_expiry: z.ZodNullable<z.ZodString>;
    /** Section 18: "Payment/reference ID where appropriate". */
    reference_id: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    status: string;
    purpose: "UNLOCK" | "SETUP_FEE";
    profile_id: string | null;
    base_amount: string;
    gst_amount: string;
    total_amount: string;
    currency: "INR";
    payment_id: string;
    transaction_at: string;
    unlock_start: string | null;
    unlock_expiry: string | null;
    reference_id: string | null;
}, {
    status: string;
    purpose: "UNLOCK" | "SETUP_FEE";
    profile_id: string | null;
    base_amount: string;
    gst_amount: string;
    total_amount: string;
    currency: "INR";
    payment_id: string;
    transaction_at: string;
    unlock_start: string | null;
    unlock_expiry: string | null;
    reference_id: string | null;
}>;
export type PaymentHistoryEntry = z.infer<typeof PaymentHistoryEntrySchema>;
/**
 * The client sends a key; it never sends a category as free text, and the
 * server always persists the value it resolved (section 3: "Store selection
 * server-side").
 *
 * B1: the key is a plain string, not a union, because the client confirmed
 * four bands on 2026-09-29 and expects to add more. The server validates the
 * key against `net_worth_category_ref` and is the only thing that can accept a
 * new band. Hardcoding a union here would force a mobile release per band.
 *
 * This is the user's OWN category, which stays server-controlled and immutable
 * by the user. The two-way visibility lists below are separate and editable.
 */
export declare const NetWorthSelectionSchema: z.ZodObject<{
    category: z.ZodString;
}, "strict", z.ZodTypeAny, {
    category: string;
}, {
    category: string;
}>;
export type NetWorthSelection = z.infer<typeof NetWorthSelectionSchema>;
/**
 * One band in a two-way visibility preference.
 *
 * A plain string, for the same reason `NetWorthSelectionSchema` uses one: the
 * server validates against `net_worth_category_ref` and is the only thing that
 * can introduce a band. `PENDING_REVIEW` is rejected here because it is a
 * review bucket rather than a band a user could discover within, and offering it
 * would let an unreviewed account be browsed.
 */
export declare const NetWorthCategoryKeySchema: z.ZodEffects<z.ZodString, string, string>;
/**
 * A band offered in the picker, as returned by
 * `GET /master-data/net-worth-categories`.
 *
 * `is_discoverable` is false only for the review bucket. It is a property of the
 * band, not a per-user permission, and it is not used to carry user intent —
 * the two lists below do that.
 */
export declare const NetWorthCategoryOptionSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    description: z.ZodString;
    min_inr: z.ZodNullable<z.ZodString>;
    max_inr: z.ZodNullable<z.ZodString>;
    setup_fee_amount: z.ZodString;
    setup_fee_total: z.ZodString;
    is_discoverable: z.ZodBoolean;
    sort_order: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    label: string;
    key: string;
    description: string;
    min_inr: string | null;
    max_inr: string | null;
    setup_fee_amount: string;
    setup_fee_total: string;
    is_discoverable: boolean;
    sort_order: number;
}, {
    label: string;
    key: string;
    description: string;
    min_inr: string | null;
    max_inr: string | null;
    setup_fee_amount: string;
    setup_fee_total: string;
    is_discoverable: boolean;
    sort_order: number;
}>;
export type NetWorthCategoryOption = z.infer<typeof NetWorthCategoryOptionSchema>;
/**
 * The user's two net-worth visibility lists.
 *
 * Both are sets, not scalars, and both default to the user's own band until the
 * user saves. An empty array is meaningful and means nobody: a deliberate
 * opt-out, not an absent value. The server distinguishes the two states with an
 * explicit flag rather than reading emptiness as intent, because collapsing them
 * would make a new user see nobody.
 */
export declare const NetWorthVisibilityPreferenceSchema: z.ZodEffects<z.ZodObject<{
    /**
     * Bands this user is open to discovering.
     *
     * Optional, and independently so: the endpoint is a PATCH, and submitting
     * only one direction must leave the other exactly as it was. Making both
     * required would force a client to send a value it did not mean to change,
     * and a whole-resource replacement that silently resets the other side
     * changes who can see the user without their intent.
     */
    discover: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    /** Bands allowed to discover this user. */
    visible_to: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
}, "strict", z.ZodTypeAny, {
    discover?: string[] | undefined;
    visible_to?: string[] | undefined;
}, {
    discover?: string[] | undefined;
    visible_to?: string[] | undefined;
}>, {
    discover?: string[] | undefined;
    visible_to?: string[] | undefined;
}, {
    discover?: string[] | undefined;
    visible_to?: string[] | undefined;
}>;
export type NetWorthVisibilityPreference = z.infer<typeof NetWorthVisibilityPreferenceSchema>;
/**
 * The stored preference, as returned to the client.
 *
 * `configured` reports whether each list was ever saved. When false the effective
 * selection is the user's own category, which is what keeps a user who has never
 * touched the setting behaving exactly as before.
 */
export declare const NetWorthVisibilityPreferenceStateSchema: z.ZodObject<{
    discover: z.ZodArray<z.ZodString, "many">;
    visible_to: z.ZodArray<z.ZodString, "many">;
    discovery_configured: z.ZodBoolean;
    visibility_configured: z.ZodBoolean;
    /** The user's own band, which cannot be changed from here. */
    own_category: z.ZodString;
    updated_at: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    updated_at: string | null;
    discover: string[];
    visible_to: string[];
    discovery_configured: boolean;
    visibility_configured: boolean;
    own_category: string;
}, {
    updated_at: string | null;
    discover: string[];
    visible_to: string[];
    discovery_configured: boolean;
    visibility_configured: boolean;
    own_category: string;
}>;
export type NetWorthVisibilityPreferenceState = z.infer<typeof NetWorthVisibilityPreferenceStateSchema>;
//# sourceMappingURL=discovery.d.ts.map