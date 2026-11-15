"use strict";
/**
 * The member's partner preferences — the "who would you like to meet" settings.
 *
 * Every field is optional except gender: an unset field means "no constraint",
 * which is why they are nullable rather than defaulted. Defaulting age or height
 * would quietly narrow a feed that the member never narrowed, and the member
 * would have no way to tell a small result set from a filter they did not set.
 *
 * This is the same row `PartnerPreference` that already carries the two-way
 * visibility flags. It is split into two contracts on purpose: visibility is
 * about exposure (who may see me), preferences are about the feed (whom I want
 * to see), and they are read by different screens.
 *
 * COMPULSORY FILTERS
 * ------------------
 * The client's reference puts a "Compulsory" tick beside each preference: a
 * ticked preference is a hard filter, and the page warns that turning it on is
 * what makes matches drop away. `compulsory` names the fields that carry a tick,
 * so the screen can render the state and the feed can tell a hard filter from a
 * merely-stated preference.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdatePartnerPreferenceSchema = exports.PartnerPreferenceStateSchema = exports.PartnerPreferenceValuesSchema = exports.PREFERENCE_FILTER_KEYS = void 0;
exports.hasPartnerPreferenceConstraints = hasPartnerPreferenceConstraints;
const zod_1 = require("zod");
const enums_1 = require("../enums");
const profile_details_js_1 = require("./profile-details.js");
const optionalText = (max) => zod_1.z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === '' ? null : value));
/**
 * A master-list id, nullable like every other preference.
 *
 * Ids rather than labels: the education and profession lists repeat a label
 * across sections, so a label would match rows in the wrong section.
 */
const optionalListId = zod_1.z
    .string()
    .trim()
    .max(64)
    .nullable()
    .transform((value) => (value === '' ? null : value));
const optionalAge = zod_1.z.number().int().min(18).max(100).nullable();
const optionalHeight = zod_1.z.number().int().min(120).max(250).nullable();
/**
 * Every preference a member can tick as compulsory.
 *
 * Named for the question rather than the column, because the tick is a product
 * concept and the columns have changed names before: `eating` is stored in
 * `foodPreference` and `occupation` in `professionId`.
 */
exports.PREFERENCE_FILTER_KEYS = [
    'gender',
    'age',
    'height',
    'marital_status',
    'religion',
    'sub_caste',
    'mother_tongue',
    'physical_status',
    'eating',
    'drinking',
    'smoking',
    'kuja_dosham',
    'education',
    'employed_in',
    'occupation',
    'annual_income',
    'country',
    'state',
    'city',
];
/** A set of acceptable answers; an empty set is "any". */
const habitSet = (values) => zod_1.z.array(zod_1.z.enum(values)).max(values.length);
/** The stored preference, as the screen reads and writes it. */
exports.PartnerPreferenceValuesSchema = zod_1.z
    .object({
    gender: zod_1.z.enum(enums_1.GENDER_PREFERENCES),
    age_min: optionalAge,
    age_max: optionalAge,
    height_min_cm: optionalHeight,
    height_max_cm: optionalHeight,
    marital_status: zod_1.z.enum(enums_1.MARITAL_STATUSES).nullable(),
    religion: optionalText(80),
    /** Religion-scoped sub-caste, matched against the profile's `sub_caste`. */
    sub_caste: optionalText(120),
    /** Master-list ids from `EDUCATION` and `PROFESSION`. */
    education_id: optionalListId,
    /** The client calls this "Occupation"; it is the profile's `professionId`. */
    profession_id: optionalListId,
    mother_tongue: optionalText(60),
    /** ISO 3166-1 alpha-2, matching how profiles store a country. */
    country: optionalText(2),
    state: optionalText(80),
    city: optionalText(80),
    // -- client feedback point 4: the preference rows our form was missing ----
    physical_status: habitSet(profile_details_js_1.PHYSICAL_STATUSES),
    eating_habits: habitSet(profile_details_js_1.EATING_HABITS),
    drinking_habits: habitSet(profile_details_js_1.DRINKING_HABITS),
    smoking_habits: habitSet(profile_details_js_1.SMOKING_HABITS),
    kuja_dosham: habitSet(profile_details_js_1.KUJA_DOSHAM_VALUES),
    employed_in: habitSet(profile_details_js_1.EMPLOYED_IN),
    annual_income_bands: habitSet(profile_details_js_1.ANNUAL_INCOME_BANDS),
    /** The preferences this member wants applied as hard filters. */
    compulsory: zod_1.z.array(zod_1.z.enum(exports.PREFERENCE_FILTER_KEYS)).max(exports.PREFERENCE_FILTER_KEYS.length),
})
    .strict()
    .superRefine((value, ctx) => {
    // A reversed range matches nobody, and the feed would answer "no profiles"
    // with no hint that the member had typed the bounds the wrong way round.
    if (value.age_min !== null && value.age_max !== null && value.age_min > value.age_max) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['age_max'],
            message: 'Maximum age must be at least the minimum age',
        });
    }
    if (value.height_min_cm !== null &&
        value.height_max_cm !== null &&
        value.height_min_cm > value.height_max_cm) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['height_max_cm'],
            message: 'Maximum height must be at least the minimum height',
        });
    }
});
/** `GET /me/partner-preference` — the saved values plus whether they were saved. */
exports.PartnerPreferenceStateSchema = zod_1.z
    .object({
    preference: exports.PartnerPreferenceValuesSchema,
    /** False until the member saves for the first time. */
    configured: zod_1.z.boolean(),
    updated_at: zod_1.z.string().nullable(),
})
    .strict();
/**
 * `PUT /me/partner-preference` — the whole form.
 *
 * Whole-resource replacement is right here, unlike the visibility lists: this
 * screen always submits every field, and clearing a field is an edit a member
 * expects to stick. A partial update would make "remove the religion filter"
 * indistinguishable from "did not mention religion".
 */
exports.UpdatePartnerPreferenceSchema = exports.PartnerPreferenceValuesSchema;
/**
 * What has been saved, regardless of whether it narrows anything today.
 *
 * The compulsory list is not counted: a tick with nothing to apply underneath it
 * does not narrow a feed, and reporting it as a constraint would claim the member
 * had restricted something they had not.
 */
function hasPartnerPreferenceConstraints(preference) {
    return (preference.gender !== 'ANY' ||
        preference.age_min !== null ||
        preference.age_max !== null ||
        preference.height_min_cm !== null ||
        preference.height_max_cm !== null ||
        preference.marital_status !== null ||
        preference.religion !== null ||
        preference.sub_caste !== null ||
        preference.education_id !== null ||
        preference.profession_id !== null ||
        preference.mother_tongue !== null ||
        preference.country !== null ||
        preference.state !== null ||
        preference.city !== null ||
        preference.physical_status.length > 0 ||
        preference.eating_habits.length > 0 ||
        preference.drinking_habits.length > 0 ||
        preference.smoking_habits.length > 0 ||
        preference.kuja_dosham.length > 0 ||
        preference.employed_in.length > 0 ||
        preference.annual_income_bands.length > 0);
}
//# sourceMappingURL=partner-preferences.js.map