/**
 * Discovery, preference and unlock-list contracts.
 * Spec sections 10, 12, 16, 18.
 */

import { z } from 'zod';
import { PreviewPhotoSchema, UnlockPriceSchema } from './profile.js';

// ---------------------------------------------------------------------------
// Section 10 — Partner Preference
// ---------------------------------------------------------------------------

export const PartnerPreferenceSchema = z
  .object({
    id: z.string().min(1),
    gender: z.enum(['MALE', 'FEMALE', 'ANY']),

    age_min: z.number().int().min(18).max(120).nullable(),
    age_max: z.number().int().min(18).max(120).nullable(),
    height_min_cm: z.number().int().min(90).max(250).nullable(),
    height_max_cm: z.number().int().min(90).max(250).nullable(),

    preferred_country: z.string().length(2).nullable(),
    preferred_state: z.string().nullable(),
    preferred_city: z.string().nullable(),

    education: z.string().nullable(),
    profession: z.string().nullable(),
    marital_status: z.string().nullable(),
    religion: z.string().nullable(),
    community: z.string().nullable(),
    mother_tongue: z.string().nullable(),
    annual_income: z.string().nullable(),
    rashi: z.string().nullable(),
    nakshatra: z.string().nullable(),
    manglik_status: z.string().nullable(),

    updated_at: z.string().datetime(),
  })
  .strict()
  .refine((v) => v.age_min === null || v.age_max === null || v.age_min <= v.age_max, {
    message: 'age_min must not exceed age_max',
    path: ['age_min'],
  })
  .refine(
    (v) => v.height_min_cm === null || v.height_max_cm === null || v.height_min_cm <= v.height_max_cm,
    { message: 'height_min_cm must not exceed height_max_cm', path: ['height_min_cm'] },
  );

export type PartnerPreference = z.infer<typeof PartnerPreferenceSchema>;

/**
 * Section 10: "Temporary filters can be applied without overwriting saved
 * preferences." These live only in the request, never in a persisted row.
 */
export const TemporaryFilterSchema = z
  .object({
    age_min: z.number().int().min(18).max(120).optional(),
    age_max: z.number().int().min(18).max(120).optional(),
    height_min_cm: z.number().int().min(90).max(250).optional(),
    height_max_cm: z.number().int().min(90).max(250).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    education: z.string().max(120).optional(),
    profession: z.string().max(120).optional(),
    income_min: z.number().int().nonnegative().optional(),
    verified_photos_only: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.age_min === undefined || v.age_max === undefined || v.age_min <= v.age_max, {
    message: 'age_min must not exceed age_max',
    path: ['age_min'],
  });

export type TemporaryFilter = z.infer<typeof TemporaryFilterSchema>;

// ---------------------------------------------------------------------------
// Section 12 — Discovery
// ---------------------------------------------------------------------------

/**
 * Section 41 requires pagination limits, and section 12 requires infinite
 * scrolling. The cap is enforced server-side; the client cannot raise it.
 */
export const DISCOVERY_PAGE_SIZE = 20;
export const DISCOVERY_MAX_LIMIT = 50;

/**
 * A discovery card. Note what is absent: no name, no contact, no income, no
 * religion. Section 12: "Search response must not include locked fields."
 */
export const DiscoveryCardSchema = z
  .object({
    profile_id: z.string().min(1),
    photos: z.array(PreviewPhotoSchema).max(6),
    profile_locked: z.literal(true),
    unlock_price: UnlockPriceSchema,
  })
  .strict();

export type DiscoveryCard = z.infer<typeof DiscoveryCardSchema>;

/**
 * Section 12: "Profile IDs must not allow unauthorized cross-category access."
 * The response echoes the applied scope so a client bug that drops the filter
 * is detectable, and so tests can assert category isolation.
 */
export const DiscoveryResponseSchema = z
  .object({
    items: z.array(DiscoveryCardSchema),
    next_cursor: z.string().nullable(),
    /**
     * The caller's own category key; every item is guaranteed to match.
     * B1 makes this a partition key rather than a filter: a client cannot ask
     * for another category, because the server overwrites this with its own
     * and no such parameter exists on the query.
     */
    applied_category: z.string().min(1),
    preference_applied: z.boolean(),
  })
  .strict();

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
export const DISCOVERY_SORTS = ['NEWEST_FIRST', 'CLOSEST_FIRST', 'NEWEST_THEN_CLOSEST'] as const;
export type DiscoverySort = (typeof DISCOVERY_SORTS)[number];

export const DiscoveryQuerySchema = z
  .object({
    cursor: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(DISCOVERY_MAX_LIMIT).default(DISCOVERY_PAGE_SIZE),
    /** Section 10: temporary filters narrow, never replace, the saved preference. */
    filters: TemporaryFilterSchema.optional(),
    /** Section 10: "Reset to Partner Preference". */
    use_saved_preference: z.boolean().default(true),
    sort: z.enum(DISCOVERY_SORTS).default('NEWEST_THEN_CLOSEST'),
  })
  // B1: "in filter and preferences settings don't show networth filters."
  // A category parameter must never appear here, so a client that tries to
  // broaden its own band is rejected by .strict() rather than silently ignored.
  .strict();

export type DiscoveryQuery = z.infer<typeof DiscoveryQuerySchema>;

// ---------------------------------------------------------------------------
// Section 16 — Active unlocks
// ---------------------------------------------------------------------------

export const ActiveUnlockSchema = z
  .object({
    unlock_id: z.string().min(1),
    profile_id: z.string().min(1),
    /** Section 16: "Profile identifier/name as permitted after unlock". */
    display_name: z.string().nullable(),
    photo: PreviewPhotoSchema.nullable(),
    unlocked_at: z.string().datetime(),
    unlock_expires_at: z.string().datetime(),
    remaining_ms: z.number().int().nonnegative(),
    is_expired: z.boolean(),
  })
  .strict();

export type ActiveUnlock = z.infer<typeof ActiveUnlockSchema>;

// ---------------------------------------------------------------------------
// Section 18 — Payment history
// ---------------------------------------------------------------------------

export const PaymentHistoryEntrySchema = z
  .object({
    payment_id: z.string().min(1),
    /**
     * D9 added the ₹15 account setup fee as a second kind of charge, so a
     * payment row can no longer be assumed to relate to a profile. B5 removed
     * "view refund status", which is why there is no refund-state field here.
     */
    purpose: z.enum(['UNLOCK', 'SETUP_FEE']),
    transaction_at: z.string().datetime(),
    /// Null for a setup fee, which buys no contact.
    profile_id: z.string().min(1).nullable(),
    base_amount: z.string(),
    gst_amount: z.string(),
    total_amount: z.string(),
    currency: z.literal('INR'),
    status: z.string(),
    unlock_start: z.string().datetime().nullable(),
    unlock_expiry: z.string().datetime().nullable(),
    /** Section 18: "Payment/reference ID where appropriate". */
    reference_id: z.string().nullable(),
  })
  .strict();

export type PaymentHistoryEntry = z.infer<typeof PaymentHistoryEntrySchema>;

// ---------------------------------------------------------------------------
// Section 3 / 7 — net-worth selection
// ---------------------------------------------------------------------------

/**
 * The client sends a key; it never sends a category as free text, and the
 * server always persists the value it resolved (section 3: "Store selection
 * server-side").
 *
 * B1: the key is a plain string, not a union, because the client confirmed
 * four bands on 2026-09-29 and expects to add more. The server validates the
 * key against `net_worth_category_ref` and is the only thing that can accept a
 * new band. Hardcoding a union here would force a mobile release per band.
 */
export const NetWorthSelectionSchema = z
  .object({
    category: z.string().min(1).max(64),
  })
  .strict();

export type NetWorthSelection = z.infer<typeof NetWorthSelectionSchema>;
