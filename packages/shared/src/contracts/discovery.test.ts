/**
 * Two-way net-worth visibility contracts.
 *
 * Covers `docs/spec/Visibility_and_Discoverability.docx` (2026-10-03), which
 * replaced hard same-category discovery with a pair of editable preferences.
 */

import { describe, it, expect } from '@jest/globals';
import {
  NetWorthCategoryKeySchema,
  NetWorthCategoryOptionSchema,
  NetWorthSelectionSchema,
  NetWorthVisibilityPreferenceSchema,
  NetWorthVisibilityPreferenceStateSchema,
  DiscoveryResponseSchema,
  DiscoveryQuerySchema,
  PartnerPreferenceSchema,
} from './discovery.js';
import { NET_WORTH_PENDING_REVIEW_KEY, SEEDED_NET_WORTH_CATEGORY_KEYS } from '../enums.js';

const BANDS = ['BELOW_2CR', 'TWO_CR_TO_FIVE_CR', 'FIVE_CR_TO_TEN_CR', 'ABOVE_10CR'];

describe('NetWorthCategoryKeySchema', () => {
  it('accepts every seeded discoverable band', () => {
    for (const key of BANDS) {
      expect(NetWorthCategoryKeySchema.parse(key)).toBe(key);
    }
  });

  it('rejects the review bucket', () => {
    // Offering it would let an account whose net worth has not been reviewed be
    // discovered within, which is the one thing the bucket exists to prevent.
    expect(NetWorthCategoryKeySchema.safeParse(NET_WORTH_PENDING_REVIEW_KEY).success).toBe(false);
  });

  it('accepts an unknown band and leaves the check to the database', () => {
    // Deliberate. Enumerating the seeded bands here would make every new band a
    // contract change plus a mobile release, which is the coupling B1 warned
    // about. The real guard is the FK to net_worth_category_ref, so an unknown
    // key fails the write instead of being stored or silently ignored.
    expect(NetWorthCategoryKeySchema.safeParse('MADE_UP_BAND').success).toBe(true);
    expect(SEEDED_NET_WORTH_CATEGORY_KEYS).toHaveLength(5);
  });
});

describe('NetWorthSelectionSchema', () => {
  it('still takes exactly one category for the user\'s own band', () => {
    expect(NetWorthSelectionSchema.parse({ category: 'BELOW_2CR' })).toEqual({
      category: 'BELOW_2CR',
    });
  });

  it('refuses an array, so own category cannot become a set', () => {
    // The own category stays scalar: it is server-controlled and immutable, and
    // is the anchor both preference lists default to.
    expect(NetWorthSelectionSchema.safeParse({ category: ['BELOW_2CR'] }).success).toBe(false);
  });
});

describe('NetWorthVisibilityPreferenceSchema', () => {
  it('accepts multiple categories in both directions', () => {
    const value = NetWorthVisibilityPreferenceSchema.parse({
      discover: ['TWO_CR_TO_FIVE_CR', 'FIVE_CR_TO_TEN_CR'],
      visible_to: ['BELOW_2CR'],
    });

    expect(value.discover).toHaveLength(2);
    expect(value.visible_to).toEqual(['BELOW_2CR']);
  });

  it('accepts an empty list, which means nobody', () => {
    // A deliberate opt-out has to be expressible. Rejecting it would remove the
    // user's only way to pause or hide without deleting the account.
    const value = NetWorthVisibilityPreferenceSchema.parse({ discover: [], visible_to: [] });
    expect(value.discover).toEqual([]);
  });

  it('rejects an empty body', () => {
    // Both directions absent would be a no-op reported as a successful save.
    expect(NetWorthVisibilityPreferenceSchema.safeParse({}).success).toBe(false);
  });

  it('accepts one direction on its own', () => {
    // The endpoint is a PATCH. Requiring both would force a client to send a
    // value it did not mean to change, and a full replacement would silently
    // reset the other side.
    expect(NetWorthVisibilityPreferenceSchema.safeParse({ discover: ['BELOW_2CR'] }).success).toBe(
      true,
    );
    expect(NetWorthVisibilityPreferenceSchema.safeParse({ visible_to: [] }).success).toBe(true);
  });

  it('distinguishes an absent list from an empty one', () => {
    // "Leave alone" and "nobody" must stay expressible as different values.
    const partial = NetWorthVisibilityPreferenceSchema.parse({ discover: [] });
    expect(partial.discover).toEqual([]);
    expect(partial.visible_to).toBeUndefined();
  });

  it('rejects the review bucket in either direction', () => {
    const result = NetWorthVisibilityPreferenceSchema.safeParse({
      discover: [NET_WORTH_PENDING_REVIEW_KEY],
      visible_to: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicates', () => {
    // The persisted tables are keyed on (userId, category), so a duplicate would
    // fail the write with a constraint error rather than a readable message.
    const result = NetWorthVisibilityPreferenceSchema.safeParse({
      discover: ['BELOW_2CR', 'BELOW_2CR'],
      visible_to: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an unknown key and defers rejection to the FK', () => {
    // As above: the schema checks shape, the database checks existence. A test
    // asserting rejection here would force the band list into the contract.
    expect(
      NetWorthVisibilityPreferenceSchema.safeParse({ discover: ['NOPE'], visible_to: [] })
        .success,
    ).toBe(true);
  });

  it('rejects extra fields so a client cannot smuggle its own category', () => {
    const result = NetWorthVisibilityPreferenceSchema.safeParse({
      discover: [],
      visible_to: [],
      own_category: 'ABOVE_10CR',
    });
    expect(result.success).toBe(false);
  });
});

describe('NetWorthVisibilityPreferenceStateSchema', () => {
  it('distinguishes never-configured from configured-to-nobody', () => {
    // The whole default-to-own-band rule depends on this being expressible. If
    // emptiness meant "unconfigured", every new user would see nobody.
    const fresh = NetWorthVisibilityPreferenceStateSchema.parse({
      discover: [],
      visible_to: [],
      discovery_configured: false,
      visibility_configured: false,
      own_category: 'BELOW_2CR',
      updated_at: null,
    });
    expect(fresh.discovery_configured).toBe(false);

    const optedOut = NetWorthVisibilityPreferenceStateSchema.parse({
      discover: [],
      visible_to: [],
      discovery_configured: true,
      visibility_configured: true,
      own_category: 'BELOW_2CR',
      updated_at: '2026-10-03T00:00:00.000Z',
    });
    expect(optedOut.discovery_configured).toBe(true);
  });

  it('reports the own category alongside the lists', () => {
    const value = NetWorthVisibilityPreferenceStateSchema.parse({
      discover: ['BELOW_2CR'],
      visible_to: ['BELOW_2CR', 'TWO_CR_TO_FIVE_CR'],
      discovery_configured: true,
      visibility_configured: true,
      own_category: 'TWO_CR_TO_FIVE_CR',
      updated_at: null,
    });
    expect(value.own_category).toBe('TWO_CR_TO_FIVE_CR');
  });
});

describe('NetWorthCategoryOptionSchema', () => {
  it('carries the setup fee base and the GST-inclusive total', () => {
    // The picker shows what a user will actually pay, so both figures are needed
    // and they differ: the ₹15 base becomes ₹17.70 once GST is added.
    const option = NetWorthCategoryOptionSchema.parse({
      key: 'BELOW_2CR',
      label: 'Net Worth Below ₹2 Crores',
      description: 'Profiles in this band cost ₹99 to unlock.',
      min_inr: null,
      max_inr: '20000000',
      setup_fee_amount: '15.00',
      setup_fee_total: '17.70',
      is_discoverable: true,
      sort_order: 1,
    });

    expect(option.setup_fee_amount).toBe('15.00');
    expect(option.setup_fee_total).toBe('17.70');
  });

  it('keeps bounds as strings because they exceed safe integer range', () => {
    const option = NetWorthCategoryOptionSchema.parse({
      key: 'ABOVE_10CR',
      label: 'Net Worth Above ₹10 Crores',
      description: '',
      min_inr: '100000000',
      max_inr: null,
      setup_fee_amount: '15.00',
      setup_fee_total: '17.70',
      is_discoverable: true,
      sort_order: 11,
    });

    expect(option.min_inr).toBe('100000000');
  });
});

describe('DiscoveryResponseSchema', () => {
  const item = {
    profile_id: 'p1',
    photos: [],
    profile_locked: true as const,
    unlock_price: {
      base_amount: '99.00',
      gst_rate: '0.1800',
      gst_amount: '17.82',
      total_amount: '116.82',
      currency: 'INR' as const,
    },
  };

  it('echoes every band searched, not a single one', () => {
    // Cross-band discovery is now possible, so a scalar scope would be a lie.
    const response = DiscoveryResponseSchema.parse({
      items: [item],
      next_cursor: null,
      applied_categories: ['TWO_CR_TO_FIVE_CR', 'FIVE_CR_TO_TEN_CR'],
      preference_applied: true,
    });

    expect(response.applied_categories).toHaveLength(2);
  });

  it('allows an empty scope for a user who opted out', () => {
    // Reachable and correct: empty-to-nobody must serialise, not throw.
    const response = DiscoveryResponseSchema.parse({
      items: [],
      next_cursor: null,
      applied_categories: [],
      preference_applied: true,
    });
    expect(response.applied_categories).toEqual([]);
  });

  it('refuses the old scalar field', () => {
    const result = DiscoveryResponseSchema.safeParse({
      items: [],
      next_cursor: null,
      applied_category: 'BELOW_2CR',
      preference_applied: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('DiscoveryQuerySchema', () => {
  it('still refuses a per-request category', () => {
    // The preference is saved and server-read. Allowing a category on the query
    // would let a client widen its own scope for one call, bypassing the setting
    // the user actually chose.
    expect(
      DiscoveryQuerySchema.safeParse({ category: 'ABOVE_10CR' }).success,
    ).toBe(false);
    expect(
      DiscoveryQuerySchema.safeParse({ categories: ['ABOVE_10CR'] }).success,
    ).toBe(false);
    expect(
      DiscoveryQuerySchema.safeParse({ networth_category: 'ABOVE_10CR' }).success,
    ).toBe(false);
  });

  it('applies its defaults', () => {
    const parsed = DiscoveryQuerySchema.parse({});
    expect(parsed.limit).toBe(20);
    expect(parsed.use_saved_preference).toBe(true);
  });

  it('coerces query-string numbers, which @Query() always supplies', () => {
    // Without coercion `?limit=1` is a 400: Nest hands the query over as
    // { limit: '1' } and a plain z.number() rejects the string.
    expect(DiscoveryQuerySchema.parse({ limit: '1' }).limit).toBe(1);
    expect(DiscoveryQuerySchema.parse({ limit: '50' }).limit).toBe(50);
  });

  it('reads use_saved_preference=false as false, not as truthiness', () => {
    // z.coerce.boolean() maps every non-empty string to true, which would invert
    // the caller's explicit instruction.
    expect(DiscoveryQuerySchema.parse({ use_saved_preference: 'false' }).use_saved_preference).toBe(false);
    expect(DiscoveryQuerySchema.parse({ use_saved_preference: 'true' }).use_saved_preference).toBe(true);
    expect(DiscoveryQuerySchema.safeParse({ use_saved_preference: '0' }).success).toBe(false);
    expect(DiscoveryQuerySchema.safeParse({ use_saved_preference: 'yes' }).success).toBe(false);
  });

  it('still rejects an out-of-range or malformed limit', () => {
    expect(DiscoveryQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(DiscoveryQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
    expect(DiscoveryQuerySchema.safeParse({ limit: 'abc' }).success).toBe(false);
    expect(DiscoveryQuerySchema.safeParse({ limit: '1.5' }).success).toBe(false);
    // An empty query parameter must not coerce to 0 and slip past as falsy.
    expect(DiscoveryQuerySchema.safeParse({ limit: '' }).success).toBe(false);
  });

  it('coerces the numeric and boolean fields inside temporary filters', () => {
    const parsed = DiscoveryQuerySchema.parse({
      filters: { age_min: '28', age_max: '34', income_min: '0', verified_photos_only: 'true' },
    });
    expect(parsed.filters).toEqual({
      age_min: 28,
      age_max: 34,
      income_min: 0,
      verified_photos_only: true,
    });
    expect(
      DiscoveryQuerySchema.parse({ filters: { verified_photos_only: 'false' } }).filters
        ?.verified_photos_only,
    ).toBe(false);
    expect(DiscoveryQuerySchema.safeParse({ filters: { age_min: '17' } }).success).toBe(false);
    expect(DiscoveryQuerySchema.safeParse({ filters: { age_min: 'old' } }).success).toBe(false);
  });

  it('keeps the saved-preference body strict rather than coercing it', () => {
    // A wrongly typed value in a saved JSON body is a client bug to surface, not
    // a string to read leniently, so PartnerPreferenceSchema is unaffected by the
    // query coercion above.
    expect(
      PartnerPreferenceSchema.safeParse({
        id: 'p1',
        gender: 'MALE',
        age_min: '28',
        age_max: 34,
        height_min_cm: null,
        height_max_cm: null,
        marital_status: null,
        religion: null,
        community: null,
        mother_tongue: null,
        annual_income: null,
        rashi: null,
        nakshatra: null,
        manglik_status: null,
        updated_at: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });
});