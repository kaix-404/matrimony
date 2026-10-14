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
import { PreviewPhotoSchema, UnlockPriceSchema } from './profile.js';
import { MAX_PROFILE_INTERESTS } from '../interests.js';

/** Query strings arrive as strings; coerce, but reject nonsense rather than NaN. */
const QueryInt = z.coerce.number().int();

/** Section 41 pagination limits. The cap is server-side; the client cannot raise it. */
export const RECOMMENDATION_PAGE_SIZE = 20;
export const RECOMMENDATION_MAX_LIMIT = 50;

// ---------------------------------------------------------------------------
// Interest selection (client answer 1: curated)
// ---------------------------------------------------------------------------

/** A curated interest, as offered in the picker. */
export const InterestOptionSchema = z
  .object({
    key: z.string().min(1).max(64),
    label: z.string().min(1).max(80),
    sort_order: z.number().int(),
  })
  .strict();

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
export const UpdateInterestsSchema = z
  .object({
    interests: z
      .array(z.string().min(1).max(64))
      .max(MAX_PROFILE_INTERESTS)
      .refine((keys) => new Set(keys).size === keys.length, 'duplicate interest'),
  })
  .strict();

export type UpdateInterestsInput = z.infer<typeof UpdateInterestsSchema>;

/** The caller's selection plus the catalogue, so a picker needs one request. */
export const ProfileInterestsSchema = z
  .object({
    selected: z.array(z.string()),
    available: z.array(InterestOptionSchema),
  })
  .strict();

export type ProfileInterests = z.infer<typeof ProfileInterestsSchema>;

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
export const RecommendationCardSchema = z
  .object({
    profile_id: z.string().min(1),
    photos: z.array(PreviewPhotoSchema).max(6),
    profile_locked: z.literal(true),
    unlock_price: UnlockPriceSchema,
    /** Candidate-curated keys the viewer also selected. Overlap count is the score. */
    shared_interests: z.array(z.string().min(1)).max(MAX_PROFILE_INTERESTS),
  })
  .strict();

export type RecommendationCard = z.infer<typeof RecommendationCardSchema>;

export const RecommendationsQuerySchema = z
  .object({
    limit: QueryInt.min(1).max(RECOMMENDATION_MAX_LIMIT).default(RECOMMENDATION_PAGE_SIZE),
  })
  .strict();

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
export const RecommendationsResponseSchema = z
  .object({
    enabled: z.boolean(),
    items: z.array(RecommendationCardSchema),
    /** Bands that were actually searched, after the two-way scope was applied. */
    applied_categories: z.array(z.string().min(1)).max(64),
    next_cursor: z.string().nullable(),
  })
  .strict();

export type RecommendationsResponse = z.infer<typeof RecommendationsResponseSchema>;
