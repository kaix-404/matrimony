/**
 * Discovery, preference and unlock-list contracts.
 * Spec sections 10, 12, 16, 18.
 */

import { z } from 'zod';
import { PreviewPhotoSchema, UnlockPriceSchema } from './profile.js';
import { NET_WORTH_PENDING_REVIEW_KEY } from '../enums.js';

// ---------------------------------------------------------------------------
// Query-string coercion
//
// Values from @Query() always arrive as strings, so `?limit=1` fails a plain
// z.number() with "Expected number, received string" and `?verified_photos_only=false`
// fails z.boolean(). These coerce from the string form while still rejecting
// nonsense, keeping a malformed query parameter a 400 rather than a silent NaN.
//
// These apply to query schemas only. PartnerPreferenceSchema is a saved JSON body
// and keeps strict types, because there a wrongly typed value is a client bug
// worth surfacing rather than a string to be read leniently.
// ---------------------------------------------------------------------------

/**
 * Deliberately not z.coerce.boolean(): that maps every non-empty string to true,
 * so an explicit `use_saved_preference=false` would read as true — the opposite
 * of what the caller asked for. Only the two literal spellings are accepted.
 */
const QueryBoolean = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

const QueryInt = z.coerce.number().int();

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
    age_min: QueryInt.min(18).max(120).optional(),
    age_max: QueryInt.min(18).max(120).optional(),
    height_min_cm: QueryInt.min(90).max(250).optional(),
    height_max_cm: QueryInt.min(90).max(250).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    education: z.string().max(120).optional(),
    profession: z.string().max(120).optional(),
    income_min: QueryInt.nonnegative().optional(),
    verified_photos_only: QueryBoolean.optional(),
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
applied_categories: z.array(z.string().min(1)).max(64),
  /** Always true in practice; see `use_saved_preference` below. */
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
    limit: QueryInt.min(1).max(DISCOVERY_MAX_LIMIT).default(DISCOVERY_PAGE_SIZE),
    /** Section 10: temporary filters narrow, never replace, the saved preference. */
    filters: TemporaryFilterSchema.optional(),
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
    use_saved_preference: QueryBoolean.default(true),
    sort: z.enum(DISCOVERY_SORTS).default('NEWEST_THEN_CLOSEST'),
  })
  // Still no category parameter, even though net worth is now a preference
  // (Visibility_and_Discoverability, 2026-10-03). The distinction is that the
  // preference is *saved* and the server reads it; a per-request category would
  // let a client widen its own scope for one call and bypass the setting the
  // user actually chose. .strict() rejects it rather than ignoring it silently.
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
 *
 * This is the user's OWN category, which stays server-controlled and immutable
 * by the user. The two-way visibility lists below are separate and editable.
 */
export const NetWorthSelectionSchema = z
  .object({
    category: z.string().min(1).max(64),
  })
  .strict();

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
export const NetWorthCategoryKeySchema = z
  .string()
  .min(1)
  .max(64)
  .refine((key) => key !== NET_WORTH_PENDING_REVIEW_KEY, {
    message: 'Category is not available for discovery',
  });

/**
 * A band offered in the picker, as returned by
 * `GET /master-data/net-worth-categories`.
 *
 * `is_discoverable` is false only for the review bucket. It is a property of the
 * band, not a per-user permission, and it is not used to carry user intent —
 * the two lists below do that.
 */
export const NetWorthCategoryOptionSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    description: z.string(),
    /// Whole rupees, as decimal strings: the values exceed Number.MAX_SAFE_INTEGER.
    min_inr: z.string().nullable(),
    max_inr: z.string().nullable(),
    /// The ₹15 base setup fee plus 18% GST. The payable amount is ₹17.70.
    setup_fee_amount: z.string(),
    setup_fee_total: z.string(),
    is_discoverable: z.boolean(),
    sort_order: z.number().int(),
  })
  .strict();

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
export const NetWorthVisibilityPreferenceSchema = z
  .object({
    /**
     * Bands this user is open to discovering.
     *
     * Optional, and independently so: the endpoint is a PATCH, and submitting
     * only one direction must leave the other exactly as it was. Making both
     * required would force a client to send a value it did not mean to change,
     * and a whole-resource replacement that silently resets the other side
     * changes who can see the user without their intent.
     */
    discover: z.array(NetWorthCategoryKeySchema).max(64).optional(),
    /** Bands allowed to discover this user. */
    visible_to: z.array(NetWorthCategoryKeySchema).max(64).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // An empty body would be a no-op, so it is a client bug rather than a
    // harmless request. Rejecting it means "you changed nothing" is never
    // reported as a successful save.
    if (value.discover === undefined && value.visible_to === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one of discover or visible_to',
      });
      return;
    }

    // Duplicates would be harmless but would imply two rows that mean one thing,
    // and the persisted tables are keyed on (userId, category) so a duplicate
    // would fail the write rather than being silently collapsed.
    for (const field of ['discover', 'visible_to'] as const) {
      const keys = value[field];
      if (keys === undefined) continue;

      const seen = new Set<string>();
      for (const key of keys) {
        if (seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `Duplicate category: ${key}`,
          });
        }
        seen.add(key);
      }
    }
  });

export type NetWorthVisibilityPreference = z.infer<typeof NetWorthVisibilityPreferenceSchema>;

/**
 * The stored preference, as returned to the client.
 *
 * `configured` reports whether each list was ever saved. When false the effective
 * selection is the user's own category, which is what keeps a user who has never
 * touched the setting behaving exactly as before.
 */
export const NetWorthVisibilityPreferenceStateSchema = z
  .object({
    discover: z.array(z.string()),
    visible_to: z.array(z.string()),
    discovery_configured: z.boolean(),
    visibility_configured: z.boolean(),
    /** The user's own band, which cannot be changed from here. */
    own_category: z.string().min(1),
    updated_at: z.string().datetime().nullable(),
  })
  .strict();

export type NetWorthVisibilityPreferenceState = z.infer<
  typeof NetWorthVisibilityPreferenceStateSchema
>;
