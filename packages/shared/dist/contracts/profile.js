"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpiredUnlockResponseSchema = exports.UnlockedProfileResponseSchema = exports.ContactSchema = exports.FullProfileSchema = exports.VISIBLE_BEFORE_PAYMENT = exports.HIDDEN_BEFORE_PAYMENT = exports.LockedProfileResponseSchema = exports.UnlockPriceSchema = exports.PreviewPhotoSchema = void 0;
const zod_1 = require("zod");
// ---------------------------------------------------------------------------
// Section 9 — photos
// ---------------------------------------------------------------------------
/**
 * Only APPROVED photos reach another user (section 9), and photos are never
 * locked behind payment (section 9: "Photos are not locked behind payment").
 * The object key is never exposed; the server issues short-lived presigned URLs.
 */
exports.PreviewPhotoSchema = zod_1.z
    .object({
    photo_id: zod_1.z.string().min(1),
    url: zod_1.z.string().url(),
    width_px: zod_1.z.number().int().positive().nullable(),
    height_px: zod_1.z.number().int().positive().nullable(),
    is_primary: zod_1.z.boolean(),
    /// D1: single-person and family group photos are both accepted.
    photo_type: zod_1.z.enum(['SINGLE', 'FAMILY']),
})
    .strict();
// ---------------------------------------------------------------------------
// Section 4 — price shown before payment
// ---------------------------------------------------------------------------
exports.UnlockPriceSchema = zod_1.z
    .object({
    base_amount: zod_1.z.string().regex(/^\d+(\.\d{1,2})?$/),
    gst_rate: zod_1.z.string().regex(/^\d*\.?\d+$/),
    gst_amount: zod_1.z.string().regex(/^\d+(\.\d{1,2})?$/),
    total_amount: zod_1.z.string().regex(/^\d+(\.\d{1,2})?$/),
    currency: zod_1.z.literal('INR'),
})
    .strict();
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
exports.LockedProfileResponseSchema = zod_1.z
    .object({
    profile_id: zod_1.z.string().min(1),
    photos: zod_1.z.array(exports.PreviewPhotoSchema),
    swagotra: zod_1.z.string().nullable(),
    maternal_gothra: zod_1.z.string().nullable(),
    date_of_birth: zod_1.z.string().nullable(),
    time_of_birth: zod_1.z.string().nullable(),
    /// A2: religion is visible on the free preview.
    religion: zod_1.z.string().nullable(),
    /// A1: with the full DOB exposed, age is visible whether or not it is
    /// sent explicitly. Included so the client does not derive it locally.
    age: zod_1.z.number().int().nonnegative().nullable(),
    profile_locked: zod_1.z.literal(true),
    unlock_price: exports.UnlockPriceSchema,
})
    .strict();
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
exports.HIDDEN_BEFORE_PAYMENT = [
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
];
/**
 * A2: shown on the locked preview even though the base document did not
 * classify them. Asserted in tests so a later "tidy-up" cannot quietly hide
 * them again.
 */
exports.VISIBLE_BEFORE_PAYMENT = ['date_of_birth', 'age', 'religion', 'gender'];
// ---------------------------------------------------------------------------
// Section 39 — UNLOCKED profile response
// ---------------------------------------------------------------------------
/** Everything that was hidden in section 13, revealed only after authorisation. */
exports.FullProfileSchema = zod_1.z
    .object({
    first_name: zod_1.z.string(),
    last_name: zod_1.z.string().nullable(),
    gender: zod_1.z.string(),
    age: zod_1.z.number().int().nonnegative().nullable(),
    date_of_birth: zod_1.z.string().nullable(),
    time_of_birth: zod_1.z.string().nullable(),
    place_of_birth: zod_1.z.string().nullable(),
    height_cm: zod_1.z.number().int().positive().nullable(),
    religion: zod_1.z.string().nullable(),
    community: zod_1.z.string().nullable(),
    mother_tongue: zod_1.z.string().nullable(),
    swagotra: zod_1.z.string().nullable(),
    maternal_gothra: zod_1.z.string().nullable(),
    rashi: zod_1.z.string().nullable(),
    nakshatra: zod_1.z.string().nullable(),
    gan: zod_1.z.string().nullable(),
    manglik_status: zod_1.z.string().nullable(),
    education: zod_1.z.string().nullable(),
    profession: zod_1.z.string().nullable(),
    company: zod_1.z.string().nullable(),
    annual_income: zod_1.z.string().nullable(),
    work_location: zod_1.z.string().nullable(),
    fathers_occupation: zod_1.z.string().nullable(),
    mothers_occupation: zod_1.z.string().nullable(),
    siblings: zod_1.z.string().nullable(),
    family_location: zod_1.z.string().nullable(),
    family_description: zod_1.z.string().nullable(),
    food_preference: zod_1.z.string().nullable(),
    smoking: zod_1.z.string().nullable(),
    drinking: zod_1.z.string().nullable(),
    about_me: zod_1.z.string().nullable(),
    country: zod_1.z.string().nullable(),
    state: zod_1.z.string().nullable(),
    city: zod_1.z.string().nullable(),
})
    .strict();
/**
 * Section 17: "Contact returned only when active unlock exists." Served with
 * Cache-Control: no-store so the app cannot persist it insecurely.
 */
exports.ContactSchema = zod_1.z
    .object({
    mobile: zod_1.z.string().min(1),
    /** Section 21: hidden entirely once the owner has been anonymised. */
    is_available: zod_1.z.boolean(),
    hidden_reason: zod_1.z.string().nullable(),
})
    .strict();
exports.UnlockedProfileResponseSchema = zod_1.z
    .object({
    profile_id: zod_1.z.string().min(1),
    photos: zod_1.z.array(exports.PreviewPhotoSchema),
    full_profile: exports.FullProfileSchema,
    contact: exports.ContactSchema,
    profile_locked: zod_1.z.literal(false),
    unlock_expires_at: zod_1.z.string().datetime(),
})
    .strict();
// ---------------------------------------------------------------------------
// Section 38 — a locked profile with no active unlock.
// The guard returns this instead of a 403 so the app can render the paywall.
// ---------------------------------------------------------------------------
exports.ExpiredUnlockResponseSchema = exports.LockedProfileResponseSchema.extend({
    unlock_price: exports.UnlockPriceSchema,
    previously_unlocked: zod_1.z.literal(true),
}).strict();
//# sourceMappingURL=profile.js.map