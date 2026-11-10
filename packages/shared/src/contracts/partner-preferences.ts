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
 */

import { z } from 'zod';
import { GENDER_PREFERENCES, MARITAL_STATUSES } from '../enums';

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
    profession_id: optionalListId,
    mother_tongue: optionalText(60),
    /** ISO 3166-1 alpha-2, matching how profiles store a country. */
    country: optionalText(2),
    state: optionalText(80),
    city: optionalText(80),
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

/** What has been saved, regardless of whether it narrows anything today. */
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
    preference.city !== null
  );
}
