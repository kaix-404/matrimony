/**
 * Section 43 QA plan, Privacy group:
 *   "Preview fields only" / "No hidden data in API" / "Contact locked"
 *
 * These tests are the enforcement mechanism for section 13. If someone adds a
 * field to a locked response, this suite fails.
 */

import { describe, it, expect } from '@jest/globals';
import {
  LockedProfileResponseSchema,
  UnlockedProfileResponseSchema,
  FullProfileSchema,
  HIDDEN_BEFORE_PAYMENT,
  VISIBLE_BEFORE_PAYMENT,
  type LockedProfileResponse,
  type UnlockedProfileResponse,
} from './profile.js';

const APPROVED_PHOTOS = [
  {
    photo_id: 'ph_1',
    url: 'https://cdn.example.com/presigned/a.jpg',
    width_px: 800,
    height_px: 1000,
    is_primary: true,
    // D1: single-person and family group photos are both accepted.
    photo_type: 'SINGLE' as const,
  },
];

const VALID_LOCKED: LockedProfileResponse = {
  profile_id: 'prf_123',
  photos: APPROVED_PHOTOS,
  swagotra: 'Kashyapa',
  maternal_gothra: 'Vasistha',
  date_of_birth: '1994-06-15',
  time_of_birth: '07:30:00',
  // A2: religion is visible on the free preview.
  religion: 'Hindu',
  // A1: age follows from the visible DOB, so it is sent rather than derived.
  age: 31,
  profile_locked: true,
  unlock_price: {
    base_amount: '99.00',
    gst_rate: '0.1800',
    gst_amount: '17.82',
    total_amount: '116.82',
    currency: 'INR',
  },
};

const FULL_PROFILE = {
  first_name: 'Asha',
  last_name: 'Menon',
  gender: 'FEMALE',
  age: 31,
  date_of_birth: '1994-06-15',
  time_of_birth: '07:30:00',
  place_of_birth: 'Kochi',
  height_cm: 165,
  religion: 'Hindu',
  community: 'Nair',
  mother_tongue: 'Malayalam',
  swagotra: 'Kashyapa',
  maternal_gothra: 'Vasistha',
  rashi: 'Taurus',
  nakshatra: 'Rohini',
  gan: 'Manushya',
  manglik_status: 'NON_MANGALIK',
  education: "Bachelor's",
  profession: 'Architect',
  company: 'Acme',
  annual_income: '1200000',
  work_location: 'Bengaluru',
  fathers_occupation: 'Engineer',
  mothers_occupation: 'Homemaker',
  siblings: 'One brother',
  family_location: 'Kochi',
  family_description: 'Well settled family',
  food_preference: 'VEGETARIAN',
  smoking: 'NO',
  drinking: 'NO',
  about_me: 'Looking for a life partner',
  country: 'IN',
  state: 'Kerala',
  city: 'Kochi',
};

const VALID_UNLOCKED: UnlockedProfileResponse = {
  profile_id: 'prf_123',
  photos: APPROVED_PHOTOS,
  full_profile: FULL_PROFILE,
  contact: { mobile: '+919876543210', is_available: true, hidden_reason: null },
  profile_locked: false,
  unlock_expires_at: '2026-03-02T10:00:00.000Z',
};

describe('section 38 — locked profile response', () => {
  it('accepts exactly the permitted preview shape', () => {
    expect(LockedProfileResponseSchema.safeParse(VALID_LOCKED).success).toBe(true);
  });

  it('permits null dob/time when the owner has not supplied them', () => {
    const sparse = { ...VALID_LOCKED, date_of_birth: null, time_of_birth: null, age: null, religion: null };
    expect(LockedProfileResponseSchema.safeParse(sparse).success).toBe(true);
  });

  it('rejects every hidden field from section 13', () => {
    const hiddenSamples: Record<string, unknown> = {
      first_name: 'Asha',
      last_name: 'Menon',
      height_cm: 165,
      education: "Bachelor's",
      profession: 'Architect',
      company: 'Acme',
      annual_income: '1200000',
      city: 'Kochi',
      state: 'Kerala',
      country: 'IN',
      community: 'Nair',
      mother_tongue: 'Malayalam',
      family_description: 'Well settled',
      about_me: 'Looking for a partner',
      contact: { mobile: '+919876543210' },
      contact_number: '+919876543210',
      rashi: 'Taurus',
      nakshatra: 'Rohini',
    };

    for (const [key, value] of Object.entries(hiddenSamples)) {
      const attempt = { ...VALID_LOCKED, [key]: value };
      const result = LockedProfileResponseSchema.safeParse(attempt);
      expect({ key, success: result.success }).toEqual({ key, success: false });
    }
  });

  /**
   * A1 and A2 reversed part of the original section 13 classification, so the
   * reversal is pinned by its own test. Without this, a later "tidy-up" of the
   * hidden list would quietly re-hide the date of birth and religion, which is
   * exactly what the client asked for on 2026-09-29.
   */
  it('A1/A2: the date of birth, age and religion are no longer treated as hidden', () => {
    for (const nowVisible of VISIBLE_BEFORE_PAYMENT) {
      expect(HIDDEN_BEFORE_PAYMENT).not.toContain(nowVisible);
    }
  });

  it('A2: community is hidden before payment', () => {
    expect(HIDDEN_BEFORE_PAYMENT).toContain('community');
  });

  it('rejects an unknown photo type, so a family photo is never mislabelled', () => {
    const attempt = {
      ...VALID_LOCKED,
      photos: [{ ...APPROVED_PHOTOS[0]!, photo_type: 'PASSPORT' }],
    };
    expect(LockedProfileResponseSchema.safeParse(attempt).success).toBe(false);
  });

  it('accepts a family group photo (D1)', () => {
    const attempt = {
      ...VALID_LOCKED,
      photos: [{ ...APPROVED_PHOTOS[0]!, photo_type: 'FAMILY' }],
    };
    expect(LockedProfileResponseSchema.safeParse(attempt).success).toBe(true);
  });

  it('rejects hidden fields smuggled under alternative or nested keys', () => {
    const smuggled = [
      { ...VALID_LOCKED, full_profile: FULL_PROFILE },
      { ...VALID_LOCKED, metadata: { city: 'Kochi' } },
      { ...VALID_LOCKED, extra: { contact_number: '+91...' } },
      { ...VALID_LOCKED, data: { first_name: 'Asha' } },
      { ...VALID_LOCKED, user: { mobile: '+91...' } },
      { ...VALID_LOCKED, profile: { name: 'Asha' } },
    ];
    for (const attempt of smuggled) {
      expect(LockedProfileResponseSchema.safeParse(attempt).success).toBe(false);
    }
  });

  it('rejects a nested object that merely looks like a permitted field', () => {
    const nested = {
      ...VALID_LOCKED,
      swagotra: { value: 'Kashyapa', hidden: 'city' },
    };
    expect(LockedProfileResponseSchema.safeParse(nested).success).toBe(false);
  });

  it('pins profile_locked to true — a locked response can never claim otherwise', () => {
    const attempt = { ...VALID_LOCKED, profile_locked: false };
    expect(LockedProfileResponseSchema.safeParse(attempt).success).toBe(false);
  });

  it('requires a real unlock price so the paywall can render', () => {
    const attempt = { ...VALID_LOCKED, unlock_price: { total_amount: '116.82' } };
    expect(LockedProfileResponseSchema.safeParse(attempt).success).toBe(false);
  });

  it('rejects a non-INR currency', () => {
    const attempt = {
      ...VALID_LOCKED,
      unlock_price: { ...VALID_LOCKED.unlock_price, currency: 'USD' },
    };
    expect(LockedProfileResponseSchema.safeParse(attempt).success).toBe(false);
  });

  it('does not leak the object storage key, only a presigned URL', () => {
    const attempt = {
      ...VALID_LOCKED,
      photos: [{ ...APPROVED_PHOTOS[0]!, object_key: 'raw/path/in/s3' }],
    };
    expect(LockedProfileResponseSchema.safeParse(attempt).success).toBe(false);
  });

  it('exposes exactly the section 13 preview field set, as revised by A1 and A2', () => {
    // This is the canary: if someone adds a field, this fails and forces a
    // conscious decision about whether it may be visible before payment.
    // It caught the addition of `religion` and `age` when A1/A2 were applied.
    expect(Object.keys(VALID_LOCKED).sort()).toEqual(
      [
        'age',
        'date_of_birth',
        'maternal_gothra',
        'photos',
        'profile_id',
        'profile_locked',
        'religion',
        'swagotra',
        'time_of_birth',
        'unlock_price',
      ].sort(),
    );
  });

  it('keeps HIDDEN_BEFORE_PAYMENT free of preview-visible field names', () => {
    const allowed = new Set(Object.keys(VALID_LOCKED));
    const overlap = HIDDEN_BEFORE_PAYMENT.filter((f) => allowed.has(f));
    expect(overlap).toEqual([]);
  });
});

describe('section 39 — unlocked profile response', () => {
  it('accepts the full shape when a valid unlock exists', () => {
    expect(UnlockedProfileResponseSchema.safeParse(VALID_UNLOCKED).success).toBe(true);
  });

  it('pins profile_locked to false', () => {
    const attempt = { ...VALID_UNLOCKED, profile_locked: true };
    expect(UnlockedProfileResponseSchema.safeParse(attempt).success).toBe(false);
  });

  it('requires an ISO unlock expiry so the client can never invent one', () => {
    const attempt = { ...VALID_UNLOCKED, unlock_expires_at: 'in 24 hours' };
    expect(UnlockedProfileResponseSchema.safeParse(attempt).success).toBe(false);
  });

  it('requires a datetime, not an epoch number', () => {
    const attempt = { ...VALID_UNLOCKED, unlock_expires_at: 1772656800000 };
    expect(UnlockedProfileResponseSchema.safeParse(attempt).success).toBe(false);
  });

  it('cannot omit the contact block once unlocked', () => {
    const { contact: _contact, ...withoutContact } = VALID_UNLOCKED;
    expect(UnlockedProfileResponseSchema.safeParse(withoutContact).success).toBe(false);
  });

  it('cannot add fields to the unlocked response either', () => {
    const attempt = { ...VALID_UNLOCKED, is_admin: true };
    expect(UnlockedProfileResponseSchema.safeParse(attempt).success).toBe(false);
  });

  it('full_profile is closed too', () => {
    const attempt = {
      ...VALID_UNLOCKED,
      full_profile: { ...FULL_PROFILE, unpublished_field: 'x' },
    };
    expect(FullProfileSchema.safeParse(attempt.full_profile).success).toBe(false);
  });
});

describe('section 17 — contact gating', () => {
  it('represents an unavailable contact without exposing digits', () => {
    const anonymised = {
      ...VALID_UNLOCKED,
      contact: { mobile: '', is_available: false, hidden_reason: 'ACCOUNT_DELETED' },
    };
    const result = UnlockedProfileResponseSchema.safeParse(anonymised);
    // mobile has a min(1) constraint, so an empty string is rejected outright.
    expect(result.success).toBe(false);
  });

  it('accepts an unavailable contact when the number is withheld explicitly', () => {
    const withdrawn = {
      ...VALID_UNLOCKED,
      contact: { mobile: 'WITHHELD', is_available: false, hidden_reason: 'USER_WITHDREW' },
    };
    expect(UnlockedProfileResponseSchema.safeParse(withdrawn).success).toBe(true);
  });
});
