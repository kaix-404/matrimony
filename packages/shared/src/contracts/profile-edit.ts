/**
 * Profile-editing contracts — spec sections 8, 9, 10.
 *
 * WHAT IS DELIBERATELY MISSING
 * ----------------------------
 * No net-worth category. `User.networthCategory` is server-controlled and
 * immutable after registration (section 36, client answer B1); only an audited
 * admin action can move it. There is no field to send it in, so a client that
 * tries cannot — the omission is the enforcement.
 *
 * No photo bytes. Photos go straight to object storage via a presigned URL; the
 * API never proxies an image, so there is no multipart contract here to get
 * wrong.
 *
 * SECTION 8 IS NOT OPTIONAL FIELDS
 * --------------------------------
 * Only `first_name`, `gender` and `date_of_birth` are required (they are
 * non-nullable in the schema). Everything else is nullable because the client
 * asked for progressive onboarding — a user should be able to save a partial
 * profile and come back to it. That is why PATCH semantics are used: an absent
 * field means "leave it alone", never "clear it", so a partial save from a
 * partially-filled form cannot silently wipe fields the user did not touch.
 * Clearing a field is an explicit `null`.
 */

import { z } from 'zod';
import { GENDERS, MARITAL_STATUSES } from '../enums';

// ---------------------------------------------------------------------------
// Shared field rules
// ---------------------------------------------------------------------------

/** C0 controls and DEL. Rejected in free text: they render as literal
 * escapes in some clients and are a common way to smuggle junk into a
 * moderated field. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const NO_CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/** Free text: trimmed, length-bounded, no control characters. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !NO_CONTROL_CHARS.test(v), 'must not contain control characters');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !NO_CONTROL_CHARS.test(v), 'must not contain control characters')
    .nullable()
    .optional();

/** ISO-3166-1 alpha-2. Uppercased so `in` and `IN` are one value. */
const country = z
  .string()
  .trim()
  .length(2)
  .transform((v) => v.toUpperCase())
  .refine((v) => /^[A-Z]{2}$/.test(v), 'must be a 2-letter ISO country code');

const masterListId = z.string().min(1).max(64);

/**
 * A date of birth, bounded to a plausible human span rather than merely "not in
 * the future". A 120-year-old account is either a typo or an attempt to game an
 * age filter, and both are worth rejecting at the edge. Calendar-validated by
 * round-tripping through Date, so 2026-02-31 is rejected rather than rolled
 * forward into March.
 */
const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
    const age = (Date.now() - d.getTime()) / (365.25 * 86_400_000);
    return age >= 18 && age <= 100;
  }, 'must be a valid date for someone aged 18 to 100');

/** A time of birth, as free text: some users give "07:30", some "7:30 am",
 * and horoscope data is entered by hand. Normalising to a single format would
 * reject real input for no benefit. */
const timeOfBirth = optionalText(20);

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Creates the user's own profile.
 *
 * `*_id` fields are master-list *value ids*, not free text, so reference data
 * and stored profiles cannot drift apart. The server resolves each id against
 * its own list, which is also why a value an admin has retired stops being
 * accepted.
 */
export const CreateProfileSchema = z
  .object({
    first_name: text(80),
    last_name: optionalText(80),
    gender: z.enum(GENDERS),
    date_of_birth: dateOfBirth,
    time_of_birth: timeOfBirth,
    place_of_birth: optionalText(120),
    height_cm: z.number().int().min(90).max(250).nullable().optional(),
    marital_status: z.enum(MARITAL_STATUSES).nullable().optional(),

    religion: optionalText(80),
    community_id: masterListId.nullable().optional(),
    mother_tongue: optionalText(60),
    swagotra: optionalText(60),
    maternal_gothra: optionalText(60),
    rashi: optionalText(40),
    nakshatra: optionalText(40),
    gan: optionalText(60),
    manglik_status: optionalText(40),

    education_id: masterListId.nullable().optional(),
    profession_id: masterListId.nullable().optional(),
    /// D3: company and income stay free text by explicit client instruction.
    company: optionalText(120),
    annual_income: optionalText(60),
    work_location: optionalText(120),

    fathers_occupation: optionalText(120),
    mothers_occupation: optionalText(120),
    siblings: optionalText(120),
    family_location: optionalText(120),
    family_description: text(2000).nullable().optional(),

    food_preference: optionalText(60),
    smoking: optionalText(60),
    drinking: optionalText(60),
    about_me: text(2000).nullable().optional(),

    country: country.nullable().optional(),
    state: optionalText(80),
    city: optionalText(80),
  })
  .strict();

export type CreateProfileInput = z.infer<typeof CreateProfileSchema>;

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * A partial profile update.
 *
 * Spelled out rather than derived from `CreateProfile` because the absent /
 * null distinction has to survive into the type: `absent` means leave alone,
 * `null` means clear. Deriving it with Partial would also drop the create-time
 * guarantee that `first_name` is non-empty, which must still hold on update.
 */
export const UpdateProfileSchema = z
  .object({
    first_name: text(80).optional(),
    last_name: optionalText(80),
    gender: z.enum(GENDERS).optional(),
    date_of_birth: dateOfBirth.optional(),
    time_of_birth: timeOfBirth,
    place_of_birth: optionalText(120),
    height_cm: z.number().int().min(90).max(250).nullable().optional(),
    marital_status: z.enum(MARITAL_STATUSES).nullable().optional(),

    religion: optionalText(80),
    community_id: masterListId.nullable().optional(),
    mother_tongue: optionalText(60),
    swagotra: optionalText(60),
    maternal_gothra: optionalText(60),
    rashi: optionalText(40),
    nakshatra: optionalText(40),
    gan: optionalText(60),
    manglik_status: optionalText(40),

    education_id: masterListId.nullable().optional(),
    profession_id: masterListId.nullable().optional(),
    company: optionalText(120),
    annual_income: optionalText(60),
    work_location: optionalText(120),

    fathers_occupation: optionalText(120),
    mothers_occupation: optionalText(120),
    siblings: optionalText(120),
    family_location: optionalText(120),
    family_description: text(2000).nullable().optional(),

    food_preference: optionalText(60),
    smoking: optionalText(60),
    drinking: optionalText(60),
    about_me: text(2000).nullable().optional(),

    country: country.nullable().optional(),
    state: optionalText(80),
    city: optionalText(80),
  })
  .strict()
  // A PATCH that changes nothing is almost always a client bug, and accepting
  // it would mask that behind a 200 which appears to have saved.
  .refine((v) => Object.keys(v).length > 0, 'must contain at least one field to update');

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/**
 * A photo as its owner sees it.
 *
 * Includes `object_key` and the review state, which the owner's own view may
 * show but another user's must never contain. `preview_url` is a presigned URL
 * with a bounded lifetime, minted per request rather than stored — a stored URL
 * expires, and worse invites treating it as a permanent link.
 */
export const OwnPhotoSchema = z
  .object({
    photo_id: z.string().min(1),
    object_key: z.string().min(1),
    mime_type: z.string().min(1),
    byte_size: z.number().int().positive(),
    width_px: z.number().int().positive(),
    height_px: z.number().int().positive(),
    photo_type: z.enum(['SINGLE', 'FAMILY']),
    is_primary: z.boolean(),
    sort_order: z.number().int(),
    status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED']),
    rejection_reason: z.string().nullable(),
    /// Short-lived; null until the object has actually been uploaded.
    preview_url: z.string().url().nullable(),
    created_at: z.string().datetime(),
  })
  .strict();

export type OwnPhoto = z.infer<typeof OwnPhotoSchema>;

/**
 * The owner's own profile.
 *
 * Not the locked preview and not the unlocked-other-user response — the full
 * record, because an owner is always authorised to see their own data. A
 * deliberately separate schema from `FullProfile` so that adding a field here
 * cannot quietly widen what another user receives.
 */
export const MyProfileSchema = z
  .object({
    profile_id: z.string().min(1),
    /** Echoed back read-only: the client displays the band, never sends it. */
    networth_category: z.string().min(1),

    first_name: z.string(),
    last_name: z.string().nullable(),
    gender: z.enum(GENDERS),
    date_of_birth: z.string(),
    time_of_birth: z.string().nullable(),
    place_of_birth: z.string().nullable(),
    height_cm: z.number().int().nullable(),
    marital_status: z.enum(MARITAL_STATUSES).nullable(),

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

    status: z.enum(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'DELETED']),
    visibility: z.enum(['ACTIVE', 'PAUSED', 'HIDDEN']),
    photos: OwnPhotoSchema.array(),
  })
  .strict();

export type MyProfile = z.infer<typeof MyProfileSchema>;

/**
 * Section 8 completion gate.
 *
 * Reported separately rather than derived from the schema, because whether a
 * profile is "complete" is a product decision (is `about_me` mandatory?) and
 * the client may still change it. Keeping it as a server-computed list of
 * outstanding fields means the client renders a checklist without hardcoding the
 * same rule a second time, where the two could disagree.
 */
export const ProfileCompletenessSchema = z
  .object({
    is_complete: z.boolean(),
    /** Field names still missing. Empty when `is_complete`. */
    missing_fields: z.array(z.string()),
  })
  .strict();

export type ProfileCompleteness = z.infer<typeof ProfileCompletenessSchema>;
