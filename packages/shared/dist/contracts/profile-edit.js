"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileCompletenessSchema = exports.MyProfileSchema = exports.OwnPhotoSchema = exports.UpdateProfileSchema = exports.CreateProfileSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("../enums");
// ---------------------------------------------------------------------------
// Shared field rules
// ---------------------------------------------------------------------------
/** C0 controls and DEL. Rejected in free text: they render as literal
 * escapes in some clients and are a common way to smuggle junk into a
 * moderated field. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const NO_CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
/** Free text: trimmed, length-bounded, no control characters. */
const text = (max) => zod_1.z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !NO_CONTROL_CHARS.test(v), 'must not contain control characters');
const optionalText = (max) => zod_1.z
    .string()
    .trim()
    .max(max)
    .refine((v) => !NO_CONTROL_CHARS.test(v), 'must not contain control characters')
    .nullable()
    .optional();
/** ISO-3166-1 alpha-2. Uppercased so `in` and `IN` are one value. */
const country = zod_1.z
    .string()
    .trim()
    .length(2)
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z]{2}$/.test(v), 'must be a 2-letter ISO country code');
const masterListId = zod_1.z.string().min(1).max(64);
/**
 * A date of birth, bounded to a plausible human span rather than merely "not in
 * the future". A 120-year-old account is either a typo or an attempt to game an
 * age filter, and both are worth rejecting at the edge. Calendar-validated by
 * round-tripping through Date, so 2026-02-31 is rejected rather than rolled
 * forward into March.
 */
const dateOfBirth = zod_1.z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)')
    .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v)
        return false;
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
exports.CreateProfileSchema = zod_1.z
    .object({
    first_name: text(80),
    last_name: optionalText(80),
    gender: zod_1.z.enum(enums_1.GENDERS),
    date_of_birth: dateOfBirth,
    time_of_birth: timeOfBirth,
    place_of_birth: optionalText(120),
    height_cm: zod_1.z.number().int().min(90).max(250).nullable().optional(),
    marital_status: zod_1.z.enum(enums_1.MARITAL_STATUSES).nullable().optional(),
    religion: optionalText(80),
    /// A value from the religion-scoped sub-caste list, only meaningful beside
    /// `religion` (see the Profile model).
    sub_caste: optionalText(80),
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
exports.UpdateProfileSchema = zod_1.z
    .object({
    first_name: text(80).optional(),
    last_name: optionalText(80),
    gender: zod_1.z.enum(enums_1.GENDERS).optional(),
    date_of_birth: dateOfBirth.optional(),
    time_of_birth: timeOfBirth,
    place_of_birth: optionalText(120),
    height_cm: zod_1.z.number().int().min(90).max(250).nullable().optional(),
    marital_status: zod_1.z.enum(enums_1.MARITAL_STATUSES).nullable().optional(),
    religion: optionalText(80),
    sub_caste: optionalText(80),
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
exports.OwnPhotoSchema = zod_1.z
    .object({
    photo_id: zod_1.z.string().min(1),
    object_key: zod_1.z.string().min(1),
    mime_type: zod_1.z.string().min(1),
    byte_size: zod_1.z.number().int().positive(),
    width_px: zod_1.z.number().int().positive(),
    height_px: zod_1.z.number().int().positive(),
    photo_type: zod_1.z.enum(['SINGLE', 'FAMILY']),
    is_primary: zod_1.z.boolean(),
    sort_order: zod_1.z.number().int(),
    status: zod_1.z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED']),
    rejection_reason: zod_1.z.string().nullable(),
    /// Short-lived; null until the object has actually been uploaded.
    preview_url: zod_1.z.string().url().nullable(),
    created_at: zod_1.z.string().datetime(),
})
    .strict();
/**
 * The owner's own profile.
 *
 * Not the locked preview and not the unlocked-other-user response — the full
 * record, because an owner is always authorised to see their own data. A
 * deliberately separate schema from `FullProfile` so that adding a field here
 * cannot quietly widen what another user receives.
 */
exports.MyProfileSchema = zod_1.z
    .object({
    profile_id: zod_1.z.string().min(1),
    /** Echoed back read-only: the client displays the band, never sends it. */
    networth_category: zod_1.z.string().min(1),
    first_name: zod_1.z.string(),
    last_name: zod_1.z.string().nullable(),
    gender: zod_1.z.enum(enums_1.GENDERS),
    date_of_birth: zod_1.z.string(),
    time_of_birth: zod_1.z.string().nullable(),
    place_of_birth: zod_1.z.string().nullable(),
    height_cm: zod_1.z.number().int().nullable(),
    marital_status: zod_1.z.enum(enums_1.MARITAL_STATUSES).nullable(),
    religion: zod_1.z.string().nullable(),
    sub_caste: zod_1.z.string().nullable(),
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
    status: zod_1.z.enum(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'DELETED']),
    /**
     * Why a moderator refused the profile, and only ever set while it is
     * REJECTED. Section 26 makes delivering the reason part of the refusal: a
     * profile that silently goes back to the member with no explanation is one
     * they can only resubmit unchanged.
     */
    rejection_reason: zod_1.z.string().nullable(),
    visibility: zod_1.z.enum(['ACTIVE', 'PAUSED', 'HIDDEN']),
    photos: exports.OwnPhotoSchema.array(),
})
    .strict();
/**
 * Section 8 completion gate.
 *
 * Reported separately rather than derived from the schema, because whether a
 * profile is "complete" is a product decision (is `about_me` mandatory?) and
 * the client may still change it. Keeping it as a server-computed list of
 * outstanding fields means the client renders a checklist without hardcoding the
 * same rule a second time, where the two could disagree.
 */
exports.ProfileCompletenessSchema = zod_1.z
    .object({
    is_complete: zod_1.z.boolean(),
    /** Field names still missing. Empty when `is_complete`. */
    missing_fields: zod_1.z.array(zod_1.z.string()),
})
    .strict();
//# sourceMappingURL=profile-edit.js.map