/**
 * AI recommendation contracts.
 *
 * Source: docs/AI_RECOMMENDATIONS_QUESTIONS.md, client answers 2026-10-14
 * (recorded in docs/decisions/ai-recommendations-2026-10-14.md).
 */

import { describe, it, expect } from '@jest/globals';
import {
  InterestOptionSchema,
  ProfileInterestsSchema,
  RECOMMENDATION_MAX_LIMIT,
  RECOMMENDATION_PAGE_SIZE,
  RecommendationCardSchema,
  RecommendationsQuerySchema,
  RecommendationsResponseSchema,
  UpdateInterestsSchema,
} from './recommendations.js';
import { DEFAULT_INTERESTS, MAX_PROFILE_INTERESTS } from '../interests.js';

describe('DEFAULT_INTERESTS', () => {
  it('has unique keys and labels', () => {
    const keys = DEFAULT_INTERESTS.map((i) => i.key);
    const labels = DEFAULT_INTERESTS.map((i) => i.label);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('orders by a non-decreasing sortOrder', () => {
    const orders = DEFAULT_INTERESTS.map((i) => i.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('is within the per-profile cap', () => {
    expect(DEFAULT_INTERESTS.length).toBeLessThanOrEqual(MAX_PROFILE_INTERESTS);
  });
});

describe('UpdateInterestsSchema', () => {
  it('accepts a subset of curated keys', () => {
    expect(UpdateInterestsSchema.parse({ interests: ['TRAVEL', 'MUSIC'] })).toEqual({
      interests: ['TRAVEL', 'MUSIC'],
    });
  });

  it('accepts an empty selection as a deliberate "none"', () => {
    expect(UpdateInterestsSchema.parse({ interests: [] })).toEqual({ interests: [] });
  });

  it('rejects duplicates', () => {
    expect(UpdateInterestsSchema.safeParse({ interests: ['TRAVEL', 'TRAVEL'] }).success).toBe(
      false,
    );
  });

  it('rejects more than the cap', () => {
    const many = Array.from({ length: MAX_PROFILE_INTERESTS + 1 }, (_, i) => `K${i}`);
    expect(UpdateInterestsSchema.safeParse({ interests: many }).success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    expect(UpdateInterestsSchema.safeParse({ interests: [], extra: true }).success).toBe(false);
  });

  it('accepts an unknown key, leaving membership to the database', () => {
    // Enumerating the catalogue here would make every new interest a client
    // release. The real guard is the FK to the Interest table.
    expect(UpdateInterestsSchema.safeParse({ interests: ['MADE_UP'] }).success).toBe(true);
  });
});

describe('InterestOptionSchema / ProfileInterestsSchema', () => {
  it('carries the wire shape of a catalogue entry', () => {
    const option = InterestOptionSchema.parse({ key: 'TRAVEL', label: 'Travel', sort_order: 10 });
    expect(option).toEqual({ key: 'TRAVEL', label: 'Travel', sort_order: 10 });
  });

  it('bundles selection and catalogue', () => {
    expect(
      ProfileInterestsSchema.parse({
        selected: ['TRAVEL'],
        available: [{ key: 'TRAVEL', label: 'Travel', sort_order: 10 }],
      }),
    ).toEqual({
      selected: ['TRAVEL'],
      available: [{ key: 'TRAVEL', label: 'Travel', sort_order: 10 }],
    });
  });
});

describe('RecommendationsQuerySchema', () => {
  it('defaults the limit to the page size', () => {
    expect(RecommendationsQuerySchema.parse({})).toEqual({ limit: RECOMMENDATION_PAGE_SIZE });
  });

  it('coerces a string limit', () => {
    expect(RecommendationsQuerySchema.parse({ limit: '5' }).limit).toBe(5);
  });

  it('rejects a limit above the server cap', () => {
    expect(RecommendationsQuerySchema.safeParse({ limit: RECOMMENDATION_MAX_LIMIT + 1 }).success).toBe(
      false,
    );
  });

  it('rejects zero and non-numeric limits', () => {
    expect(RecommendationsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(RecommendationsQuerySchema.safeParse({ limit: 'nope' }).success).toBe(false);
  });
});

const CARD = {
  profile_id: 'ck1234567890123456789012',
  photos: [],
  profile_locked: true,
  unlock_price: {
    base_amount: '99.00',
    gst_rate: '0.1800',
    gst_amount: '17.82',
    total_amount: '116.82',
    currency: 'INR',
  },
  shared_interests: ['MUSIC', 'TRAVEL'],
} as const;

describe('RecommendationCardSchema', () => {
  it('accepts a well-formed card', () => {
    expect(RecommendationCardSchema.parse(CARD)).toEqual(CARD);
  });

  it('requires the card to be locked', () => {
    expect(RecommendationCardSchema.safeParse({ ...CARD, profile_locked: false }).success).toBe(
      false,
    );
  });

  it('rejects an unlocked field leaking in', () => {
    expect(RecommendationCardSchema.safeParse({ ...CARD, first_name: 'Asha' }).success).toBe(false);
  });
});

describe('RecommendationsResponseSchema', () => {
  it('accepts a disabled empty page', () => {
    expect(
      RecommendationsResponseSchema.parse({
        enabled: false,
        items: [],
        applied_categories: [],
        next_cursor: null,
      }),
    ).toEqual({ enabled: false, items: [], applied_categories: [], next_cursor: null });
  });

  it('accepts an enabled page with a card', () => {
    const parsed = RecommendationsResponseSchema.parse({
      enabled: true,
      items: [CARD],
      applied_categories: ['BELOW_2CR'],
      next_cursor: null,
    });
    expect(parsed.items).toHaveLength(1);
  });
});
