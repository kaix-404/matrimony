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

import { z } from 'zod';
import { GENDER_PREFERENCES, MARITAL_STATUSES } from '../enums';
import {
  ANNUAL_INCOME_BANDS,
  DRINKING_HABITS,
  EATING_HABITS,
  EMPLOYED_IN,
  KUJA_DOSHAM_VALUES,
  PHYSICAL_STATUSES,
  SMOKING_HABITS,
} from './profile-details.js';

const optionalText = (max: number) =>
  z
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
const optionalListId = z
  .string()
  .trim()
  .max(64)
  .nullable()
  .transform((value) => (value === '' ? null : value));

const optionalAge = z.number().int().min(18).max(100).nullable();
const optionalHeight = z.number().int().min(120).max(250).nullable();

/**
 * Every preference a member can tick as compulsory.
 *
 * Named for the question rather than the column, because the tick is a product
 * concept and the columns have changed names before: `eating` is stored in
 * `foodPreference` and `occupation` in `professionId`.
 */
export const PREFERENCE_FILTER_KEYS = [
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
] as const;

export type PreferenceFilterKey = (typeof PREFERENCE_FILTER_KEYS)[number];

/** A set of acceptable answers; an empty set is "any". */
const habitSet = <T extends readonly [string, ...string[]]>(values: T) =>
  z.array(z.enum(values)).max(values.length);

/** The stored preference, as the screen reads and writes it. */
export const PartnerPreferenceValuesSchema = z
  .object({
    gender: z.enum(GENDER_PREFERENCES),
    age_min: optionalAge,
    age_max: optionalAge,
    height_min_cm: optionalHeight,
    height_max_cm: optionalHeight,
    marital_status: z.enum(MARITAL_STATUSES).nullable(),
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
    physical_status: habitSet(PHYSICAL_STATUSES),
    eating_habits: habitSet(EATING_HABITS),
    drinking_habits: habitSet(DRINKING_HABITS),
    smoking_habits: habitSet(SMOKING_HABITS),
    kuja_dosham: habitSet(KUJA_DOSHAM_VALUES),
    employed_in: habitSet(EMPLOYED_IN),
    annual_income_bands: habitSet(ANNUAL_INCOME_BANDS),

    /** The preferences this member wants applied as hard filters. */
    compulsory: z.array(z.enum(PREFERENCE_FILTER_KEYS)).max(PREFERENCE_FILTER_KEYS.length),
  })
  .strict()
  .superRefine((value, ctx) => {
    // A reversed range matches nobody, and the feed would answer "no profiles"
    // with no hint that the member had typed the bounds the wrong way round.
    if (value.age_min !== null && value.age_max !== null && value.age_min > value.age_max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['age_max'],
        message: 'Maximum age must be at least the minimum age',
      });
    }
    if (
      value.height_min_cm !== null &&
      value.height_max_cm !== null &&
      value.height_min_cm > value.height_max_cm
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['height_max_cm'],
        message: 'Maximum height must be at least the minimum height',
      });
    }
  });

export type PartnerPreferenceValues = z.infer<typeof PartnerPreferenceValuesSchema>;

/** `GET /me/partner-preference` — the saved values plus whether they were saved. */
export const PartnerPreferenceStateSchema = z
  .object({
    preference: PartnerPreferenceValuesSchema,
    /** False until the member saves for the first time. */
    configured: z.boolean(),
    updated_at: z.string().nullable(),
  })
  .strict();

export type PartnerPreferenceState = z.infer<typeof PartnerPreferenceStateSchema>;

/**
 * `PUT /me/partner-preference` — the whole form.
 *
 * Whole-resource replacement is right here, unlike the visibility lists: this
 * screen always submits every field, and clearing a field is an edit a member
 * expects to stick. A partial update would make "remove the religion filter"
 * indistinguishable from "did not mention religion".
 */
export const UpdatePartnerPreferenceSchema = PartnerPreferenceValuesSchema;

export type UpdatePartnerPreferenceInput = z.infer<typeof UpdatePartnerPreferenceSchema>;

/**
 * What has been saved, regardless of whether it narrows anything today.
 *
 * The compulsory list is not counted: a tick with nothing to apply underneath it
 * does not narrow a feed, and reporting it as a constraint would claim the member
 * had restricted something they had not.
 */
export function hasPartnerPreferenceConstraints(preference: PartnerPreferenceValues): boolean {
  return (
    preference.gender !== 'ANY' ||
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
    preference.annual_income_bands.length > 0
  );
}
