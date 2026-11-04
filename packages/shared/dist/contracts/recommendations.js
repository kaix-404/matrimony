"use strict";
/**
 * AI profile recommendation contracts.
 * Source: docs/AI_RECOMMENDATIONS_QUESTIONS.md, client answers 2026-10-14
 * (recorded in docs/decisions/ai-recommendations-2026-10-14.md).
 *
 * A recommendation is a discovery candidate that also shares an interest with
 * the viewer, so the card reuses the discovery projection and adds nothing that
 * discovery withholds. See discovery.ts for the eligibility/scope it inherits.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecommendationsResponseSchema = exports.RecommendationsQuerySchema = exports.RecommendationCardSchema = exports.ProfileInterestsSchema = exports.UpdateInterestsSchema = exports.InterestOptionSchema = exports.RECOMMENDATION_MAX_LIMIT = exports.RECOMMENDATION_PAGE_SIZE = void 0;
const zod_1 = require("zod");
const profile_js_1 = require("./profile.js");
const interests_js_1 = require("../interests.js");
/** Query strings arrive as strings; coerce, but reject nonsense rather than NaN. */
const QueryInt = zod_1.z.coerce.number().int();
/** Section 41 pagination limits. The cap is server-side; the client cannot raise it. */
exports.RECOMMENDATION_PAGE_SIZE = 20;
exports.RECOMMENDATION_MAX_LIMIT = 50;
// ---------------------------------------------------------------------------
// Interest selection (client answer 1: curated)
// ---------------------------------------------------------------------------
/** A curated interest, as offered in the picker. */
exports.InterestOptionSchema = zod_1.z
    .object({
    key: zod_1.z.string().min(1).max(64),
    label: zod_1.z.string().min(1).max(80),
    sort_order: zod_1.z.number().int(),
})
    .strict();
/**
 * Replaces a profile's interest selection.
 *
 * Whole-set replacement, like the net-worth visibility lists: the picker submits
 * the complete selection and an empty array is a deliberate "none", which a
 * delta based patch could not express. Membership in the curated catalogue is not
 * enumerated here — that is a data question answered against the `Interest` table
 * — but shape and duplicates are rejected at the edge.
 */
exports.UpdateInterestsSchema = zod_1.z
    .object({
    interests: zod_1.z
        .array(zod_1.z.string().min(1).max(64))
        .max(interests_js_1.MAX_PROFILE_INTERESTS)
        .refine((keys) => new Set(keys).size === keys.length, 'duplicate interest'),
})
    .strict();
/** The caller's selection plus the catalogue, so a picker needs one request. */
exports.ProfileInterestsSchema = zod_1.z
    .object({
    selected: zod_1.z.array(zod_1.z.string()),
    available: zod_1.z.array(exports.InterestOptionSchema),
})
    .strict();
// ---------------------------------------------------------------------------
// Recommendations (client answers 3, 4, 6, 7)
// ---------------------------------------------------------------------------
/**
 * A recommendation card.
 *
 * Identical to a discovery card — id, approved photos, a price, always locked —
 * plus the interests the viewer and the candidate share. `shared_interests`
 * exists so answer 4's "reasons shown" is possible without a second request; the
 * UI decision to actually render it is answer 6, and a client may ignore it.
 */
exports.RecommendationCardSchema = zod_1.z
    .object({
    profile_id: zod_1.z.string().min(1),
    photos: zod_1.z.array(profile_js_1.PreviewPhotoSchema).max(6),
    profile_locked: zod_1.z.literal(true),
    unlock_price: profile_js_1.UnlockPriceSchema,
    /** Candidate-curated keys the viewer also selected. Overlap count is the score. */
    shared_interests: zod_1.z.array(zod_1.z.string().min(1)).max(interests_js_1.MAX_PROFILE_INTERESTS),
})
    .strict();
exports.RecommendationsQuerySchema = zod_1.z
    .object({
    limit: QueryInt.min(1).max(exports.RECOMMENDATION_MAX_LIMIT).default(exports.RECOMMENDATION_PAGE_SIZE),
})
    .strict();
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
exports.RecommendationsResponseSchema = zod_1.z
    .object({
    enabled: zod_1.z.boolean(),
    items: zod_1.z.array(exports.RecommendationCardSchema),
    /** Bands that were actually searched, after the two-way scope was applied. */
    applied_categories: zod_1.z.array(zod_1.z.string().min(1)).max(64),
    next_cursor: zod_1.z.string().nullable(),
})
    .strict();
//# sourceMappingURL=recommendations.js.map