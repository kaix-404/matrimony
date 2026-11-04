"use strict";
/**
 * Biodata import contracts — the "upload your biodata and we fill the form"
 * flow.
 *
 * WHAT THIS IS
 * ------------
 * A user with a ready-made matrimonial biodata (a typed PDF, or a text/Word
 * file exported to text) can attach it instead of retyping every field. The API
 * reads the file, extracts the fields it recognises, and returns them as a
 * *proposal*. The user reviews and saves through the ordinary profile edit
 * endpoint — nothing here writes to the profile.
 *
 * WHY A PROPOSAL, NOT A SAVE
 * --------------------------
 * Extraction is best-effort: a biodata is free prose written by a stranger, and
 * a regex that guesses wrong must never silently overwrite a correct profile.
 * So this endpoint only ever reads, and the response names the fields it filled
 * and the ones it could not, so the client can highlight exactly what to check.
 *
 * WHY NO BYTES HERE
 * -----------------
 * Like photos, the document goes straight to object storage via a presigned
 * PUT; the client then sends only the object key it was given. The API re-reads
 * the key from storage itself, so a client cannot ask it to parse an arbitrary
 * URL (an SSRF hole) or another profile's object.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BIODATA_MARITAL_STATUSES = exports.BIODATA_GENDERS = exports.BIODATA_FIELD_LABELS = exports.BiodataExtractionSchema = exports.BiodataValueSchema = exports.BIODATA_FIELDS = exports.BiodataUploadTicketSchema = exports.InitiateBiodataUploadSchema = exports.BIODATA_MIME_TYPES = exports.ParseBiodataSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("../enums");
// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------
/**
 * A document the client has already uploaded.
 *
 * `object_key` must be one the API minted for this user; the parser rejects any
 * key outside the caller's own `biodata/` prefix, so the key is not a
 * capability to read someone else's upload.
 */
exports.ParseBiodataSchema = zod_1.z
    .object({
    object_key: zod_1.z.string().min(1).max(512),
})
    .strict();
/**
 * What the client may upload. PDF and plain text only.
 *
 * DOCX is deliberately absent: it is a zip container and would need an
 * unzip-and-strip step whose parsing surface is larger than the feature is
 * worth, so the client is told to export it to PDF, which every word processor
 * can do. Images (a photo of a printed biodata) are out of scope without OCR.
 */
exports.BIODATA_MIME_TYPES = ['application/pdf', 'text/plain'];
exports.InitiateBiodataUploadSchema = zod_1.z
    .object({
    mime_type: zod_1.z.enum(exports.BIODATA_MIME_TYPES),
    byte_size: zod_1.z
        .number()
        .int()
        .positive()
        .max(10 * 1024 * 1024),
})
    .strict();
/**
 * A reserved upload slot, mirroring the photo handshake so the client has one
 * upload pattern to learn.
 */
exports.BiodataUploadTicketSchema = zod_1.z
    .object({
    upload_url: zod_1.z.string().url(),
    object_key: zod_1.z.string().min(1),
    expires_in_seconds: zod_1.z.number().int().positive(),
})
    .strict();
// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------
/**
 * The profile fields a biodata can populate.
 *
 * A subset of the full edit surface on purpose: the fields a typical biodata
 * actually carries. Net worth is not here — it is server-controlled (B1) — and
 * neither are photo-related fields.
 */
exports.BIODATA_FIELDS = [
    'first_name',
    'last_name',
    'gender',
    'date_of_birth',
    'time_of_birth',
    'place_of_birth',
    'height_cm',
    'marital_status',
    'religion',
    'community',
    'mother_tongue',
    'swagotra',
    'maternal_gothra',
    'rashi',
    'nakshatra',
    'gan',
    'manglik_status',
    'education',
    'profession',
    'company',
    'annual_income',
    'work_location',
    'fathers_occupation',
    'mothers_occupation',
    'siblings',
    'family_location',
    'family_description',
    'food_preference',
    'smoking',
    'drinking',
    'about_me',
    'country',
    'state',
    'city',
];
/**
 * One extracted value.
 *
 * `confidence` is coarse — `high` for a value taken from a labelled line, `low`
 * for one inferred from context — and exists so the client can flag the shaky
 * ones for the user to double-check rather than presenting everything as fact.
 */
exports.BiodataValueSchema = zod_1.z
    .object({
    field: zod_1.z.enum(exports.BIODATA_FIELDS),
    /** The raw text as it appears, for the client to show and let the user edit. */
    value: zod_1.z.string().min(1),
    /** `high` = labelled line; `low` = inferred. */
    confidence: zod_1.z.enum(['high', 'low']),
    /**
     * For the three master-list fields (`education`, `profession`, `community`),
     * the id the value resolved to, if it did. The profile endpoint accepts only
     * these ids, so a value without one cannot be saved as-is and the client
     * must let the user pick from the list instead.
     */
    master_list_id: zod_1.z.string().min(1).optional(),
})
    .strict();
/**
 * The extraction result.
 *
 * `values` are the fields that resolved; `unrecognised` are the fields the
 * parser looked for and did not find, so the client can pre-mark the rest of
 * the form as "still needed" without recomputing the same list. `warnings`
 * carries anything the user should know — most importantly that a scanned PDF
 * yielded no text layer.
 */
exports.BiodataExtractionSchema = zod_1.z
    .object({
    values: zod_1.z.array(exports.BiodataValueSchema),
    unrecognised: zod_1.z.array(zod_1.z.enum(exports.BIODATA_FIELDS)),
    warnings: zod_1.z.array(zod_1.z.string()),
})
    .strict();
/**
 * Field labels the client shows in the review step, and the ones the pure
 * parser keys on. Shared so the two cannot drift: a field the parser can fill
 * but the review screen has no label for would render as `mother_tongue`.
 */
exports.BIODATA_FIELD_LABELS = {
    first_name: 'First name',
    last_name: 'Last name',
    gender: 'Gender',
    date_of_birth: 'Date of birth',
    time_of_birth: 'Time of birth',
    place_of_birth: 'Place of birth',
    height_cm: 'Height (cm)',
    marital_status: 'Marital status',
    religion: 'Religion',
    community: 'Community',
    mother_tongue: 'Mother tongue',
    swagotra: 'Swagotra',
    maternal_gothra: 'Maternal gothra',
    rashi: 'Rashi',
    nakshatra: 'Nakshatra',
    gan: 'Gan',
    manglik_status: 'Manglik',
    education: 'Education',
    profession: 'Profession',
    company: 'Company',
    annual_income: 'Annual income',
    work_location: 'Work location',
    fathers_occupation: "Father's occupation",
    mothers_occupation: "Mother's occupation",
    siblings: 'Siblings',
    family_location: 'Family location',
    family_description: 'Family description',
    food_preference: 'Food preference',
    smoking: 'Smoking',
    drinking: 'Drinking',
    about_me: 'About me',
    country: 'Country',
    state: 'State',
    city: 'City',
};
/** Gender and marital status vocabularies, re-exported for the parser. */
exports.BIODATA_GENDERS = enums_1.GENDERS;
exports.BIODATA_MARITAL_STATUSES = enums_1.MARITAL_STATUSES;
//# sourceMappingURL=biodata.js.map