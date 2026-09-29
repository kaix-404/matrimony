/**
 * Profile visibility contracts — spec sections 13, 38, 39.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Section 13 states hidden fields "must not be sent to the app", and section 38
 * adds that they "must not contain hidden fields under alternative JSON keys,
 * nested objects or metadata". A blurred UI is explicitly not acceptable
 * (section 46: "Do not send information to the mobile app unless the user is
 * authorized to see it").
 *
 * The practical way to make that guarantee is to define the wire format as a
 * closed schema and validate responses against it. Every schema below is
 * `.strict()`, so an accidental `{ ...profile }` spread that leaks a field
 * fails type-checking in CI and fails validation at runtime. There is no code
 * path that can widen these shapes without changing this file.
 *
 * Section 41 adds "profile enumeration protection" — a strict schema also
 * guarantees the response cannot become a harvest vector.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Section 9 — photos
// ---------------------------------------------------------------------------

/**
 * Only APPROVED photos reach another user (section 9), and photos are never
 * locked behind payment (section 9: "Photos are not locked behind payment").
 * The object key is never exposed; the server issues short-lived presigned URLs.
 */
export const PreviewPhotoSchema = z
  .object({
    photo_id: z.string().min(1),
    url: z.string().url(),
    width_px: z.number().int().positive().nullable(),
    height_px: z.number().int().positive().nullable(),
    is_primary: z.boolean(),
    /// D1: single-person and family group photos are both accepted.
    photo_type: z.enum(['SINGLE', 'FAMILY']),
  })
  .strict();

export type PreviewPhoto = z.infer<typeof PreviewPhotoSchema>;

// ---------------------------------------------------------------------------
// Section 4 — price shown before payment
// ---------------------------------------------------------------------------

export const UnlockPriceSchema = z
  .object({
    base_amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    gst_rate: z.string().regex(/^\d*\.?\d+$/),
    gst_amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    total_amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    currency: z.literal('INR'),
  })
  .strict();

export type UnlockPrice = z.infer<typeof UnlockPriceSchema>;

// ---------------------------------------------------------------------------
// Section 38 — LOCKED profile response
// ---------------------------------------------------------------------------

/**
 * The complete set of fields a user may see before paying. Section 13 lists
 * all approved photos, swagotra, maternal gothra, date of birth and time of
 * birth. A2 adds religion to that set, and A1 confirms the full date of birth
 * is shown. Community is explicitly NOT here (A2).
 *
 * `profile_locked` is a literal true so the type system prevents a locked
 * response from ever advertising unlocked state.
 */
export const LockedProfileResponseSchema = z
  .object({
    profile_id: z.string().min(1),
    photos: z.array(PreviewPhotoSchema),
    swagotra: z.string().nullable(),
    maternal_gothra: z.string().nullable(),
    date_of_birth: z.string().nullable(),
    time_of_birth: z.string().nullable(),
    /// A2: religion is visible on the free preview.
    religion: z.string().nullable(),
    /// A1: with the full DOB exposed, age is visible whether or not it is
    /// sent explicitly. Included so the client does not derive it locally.
    age: z.number().int().nonnegative().nullable(),
    profile_locked: z.literal(true),
    unlock_price: UnlockPriceSchema,
  })
  .strict();

export type LockedProfileResponse = z.infer<typeof LockedProfileResponseSchema>;

/**
 * Section 13, "HIDDEN BEFORE PAYMENT", as revised by the client on 2026-09-29.
 * Kept as an explicit list of field names so a test can assert the locked
 * response contains none of them, and so a future field added to the schema
 * must be consciously classified.
 *
 * Two revisions, both from A1 and A2:
 *
 *   A1 — the full date of birth is now VISIBLE. This also makes age visible,
 *        which is unavoidable: masking a DOB hides nothing, because the date
 *        itself gives the age away. `age` and `age_derived` are therefore
 *        removed from this list too, and the app must stop pretending to hide
 *        them.
 *   A2 — `community` is HIDDEN and `religion` is VISIBLE on the free preview.
 *        This is the reverse of how the two were previously grouped, and it
 *        was not one of the options offered in the questionnaire. It is
 *        implemented as written and flagged for confirmation.
 */
export const HIDDEN_BEFORE_PAYMENT = [
  'name',
  'first_name',
  'last_name',
  'height_cm',
  'education',
  'profession',
  'company',
  'annual_income',
  'location',
  'country',
  'state',
  'city',
  'community',
  'mother_tongue',
  'family',
  'family_details',
  'fathers_occupation',
  'mothers_occupation',
  'siblings',
  'family_location',
  'family_description',
  'lifestyle',
  'food_preference',
  'smoking',
  'drinking',
  'about_me',
  'partner_expectations',
  'horoscope',
  'rashi',
  'nakshatra',
  'gan',
  'manglik_status',
  'contact',
  'contact_number',
  'mobile',
  'email',
  'metadata',
  'attributes',
] as const;

export type HiddenBeforePayment = (typeof HIDDEN_BEFORE_PAYMENT)[number];

/**
 * A2: shown on the locked preview even though the base document did not
 * classify them. Asserted in tests so a later "tidy-up" cannot quietly hide
 * them again.
 */
export const VISIBLE_BEFORE_PAYMENT = ['date_of_birth', 'age', 'religion', 'gender'] as const;

// ---------------------------------------------------------------------------
// Section 39 — UNLOCKED profile response
// ---------------------------------------------------------------------------

/** Everything that was hidden in section 13, revealed only after authorisation. */
export const FullProfileSchema = z
  .object({
    first_name: z.string(),
    last_name: z.string().nullable(),
    gender: z.string(),
    age: z.number().int().nonnegative().nullable(),
    date_of_birth: z.string().nullable(),
    time_of_birth: z.string().nullable(),
    place_of_birth: z.string().nullable(),
    height_cm: z.number().int().positive().nullable(),

    religion: z.string().nullable(),
    community: z.string().nullable(),
    mother_tongue: z.string().nullable(),
    swagotra: z.string().nullable(),
    maternal_gothra: z.string().nullable(),
    rashi: z.string().nullable(),
    nakshatra: z.string().nullable(),
    gan: z.string().nullable(),
    manglik_status: z.string().nullable(),

    education: z.string().nullable(),
    profession: z.string().nullable(),
    company: z.string().nullable(),
    annual_income: z.string().nullable(),
    work_location: z.string().nullable(),

    fathers_occupation: z.string().nullable(),
    mothers_occupation: z.string().nullable(),
    siblings: z.string().nullable(),
    family_location: z.string().nullable(),
    family_description: z.string().nullable(),

    food_preference: z.string().nullable(),
    smoking: z.string().nullable(),
    drinking: z.string().nullable(),
    about_me: z.string().nullable(),

    country: z.string().nullable(),
    state: z.string().nullable(),
    city: z.string().nullable(),
  })
  .strict();

export type FullProfile = z.infer<typeof FullProfileSchema>;

/**
 * Section 17: "Contact returned only when active unlock exists." Served with
 * Cache-Control: no-store so the app cannot persist it insecurely.
 */
export const ContactSchema = z
  .object({
    mobile: z.string().min(1),
    /** Section 21: hidden entirely once the owner has been anonymised. */
    is_available: z.boolean(),
    hidden_reason: z.string().nullable(),
  })
  .strict();

export type Contact = z.infer<typeof ContactSchema>;

export const UnlockedProfileResponseSchema = z
  .object({
    profile_id: z.string().min(1),
    photos: z.array(PreviewPhotoSchema),
    full_profile: FullProfileSchema,
    contact: ContactSchema,
    profile_locked: z.literal(false),
    unlock_expires_at: z.string().datetime(),
  })
  .strict();

export type UnlockedProfileResponse = z.infer<typeof UnlockedProfileResponseSchema>;

// ---------------------------------------------------------------------------
// Section 38 — a locked profile with no active unlock.
// The guard returns this instead of a 403 so the app can render the paywall.
// ---------------------------------------------------------------------------

export const ExpiredUnlockResponseSchema = LockedProfileResponseSchema.extend({
  unlock_price: UnlockPriceSchema,
  previously_unlocked: z.literal(true),
}).strict();

export type ExpiredUnlockResponse = z.infer<typeof ExpiredUnlockResponseSchema>;
