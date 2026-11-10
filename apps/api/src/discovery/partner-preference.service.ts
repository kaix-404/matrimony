import { Injectable } from '@nestjs/common';
import type { Prisma } from '../prisma/prisma-client';
import { PrismaClient } from '../prisma/prisma-client';
import type {
  PartnerPreferenceState,
  PartnerPreferenceValues,
  UpdatePartnerPreferenceInput,
} from '@matrimony/shared';
import { hasPartnerPreferenceConstraints } from '@matrimony/shared';

/**
 * No constraints: every band, any gender, any age.
 *
 * Returned instead of null so the screen renders the form once and the member
 * sees empty fields rather than a special "not set" screen — an empty form is
 * also the truthful description of what an unsaved preference does.
 */
export const EMPTY_PREFERENCE: PartnerPreferenceValues = {
  gender: 'ANY',
  age_min: null,
  age_max: null,
  height_min_cm: null,
  height_max_cm: null,
  marital_status: null,
  religion: null,
  sub_caste: null,
  education_id: null,
  profession_id: null,
  mother_tongue: null,
  country: null,
  state: null,
  city: null,
};

type PreferenceRow = {
  gender: PartnerPreferenceValues['gender'];
  ageMin: number | null;
  ageMax: number | null;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  maritalStatus: PartnerPreferenceValues['marital_status'];
  religion: string | null;
  subCaste: string | null;
  educationId: string | null;
  professionId: string | null;
  motherTongue: string | null;
  preferredCountry: string | null;
  preferredState: string | null;
  preferredCity: string | null;
  updatedAt: Date;
};

/**
 * The columns this service reads.
 *
 * Exported so a test can check every key against Prisma's own field list. A
 * select naming a column that does not exist is not a type error — an object
 * passed as a variable skips TypeScript's excess-property check — so it reaches
 * production as a runtime validation error and turns the whole screen, and the
 * feed that reads the same row, into a 500.
 */
export const PREFERENCE_SELECT = {
  gender: true,
  ageMin: true,
  ageMax: true,
  heightMinCm: true,
  heightMaxCm: true,
  maritalStatus: true,
  religion: true,
  subCaste: true,
  educationId: true,
  professionId: true,
  motherTongue: true,
  preferredCountry: true,
  preferredState: true,
  preferredCity: true,
  updatedAt: true,
} as const satisfies Prisma.PartnerPreferenceSelect;

/** Stored columns to the wire shape the app reads. */
export function toPreferenceValues(row: PreferenceRow): PartnerPreferenceValues {
  return {
    gender: row.gender,
    age_min: row.ageMin,
    age_max: row.ageMax,
    height_min_cm: row.heightMinCm,
    height_max_cm: row.heightMaxCm,
    marital_status: row.maritalStatus,
    religion: row.religion,
    sub_caste: row.subCaste,
    education_id: row.educationId,
    profession_id: row.professionId,
    mother_tongue: row.motherTongue,
    country: row.preferredCountry,
    state: row.preferredState,
    city: row.preferredCity,
  };
}

/**
 * The stored columns for a preference being saved.
 *
 * The return type is what catches a wrong column name here: a literal returned
 * as a Prisma input type is checked for excess properties, so naming a column
 * the model does not have fails the build instead of failing at runtime on the
 * member's first save. The create input is used because it takes plain values;
 * the update input's field-operation unions are not assignable back into a
 * create.
 */
export function toPreferenceColumns(
  input: UpdatePartnerPreferenceInput,
): Omit<Prisma.PartnerPreferenceUncheckedCreateInput, 'userId' | 'id'> {
  return {
    gender: input.gender,
    ageMin: input.age_min,
    ageMax: input.age_max,
    heightMinCm: input.height_min_cm,
    heightMaxCm: input.height_max_cm,
    maritalStatus: input.marital_status,
    religion: input.religion,
    subCaste: input.sub_caste,
    educationId: input.education_id,
    professionId: input.profession_id,
    motherTongue: input.mother_tongue,
    preferredCountry: input.country === null ? null : input.country.toUpperCase(),
    preferredState: input.state,
    preferredCity: input.city,
  };
}

/**
 * The discovery filter a saved preference describes.
 *
 * Only fields a profile actually carries are expressible here: religion,
 * sub-caste, education, profession, mother tongue, marital status, height,
 * gender, age and location. A constraint on a field the candidate does not have
 * excludes the candidate — a member who asked for Hindu profiles has not asked
 * to be shown profiles of unknown religion.
 *
 * Age is a date range rather than a computed age so the query can use the
 * `(gender, dateOfBirth)` index, and `now` is a parameter so the boundaries are
 * testable without freezing the clock.
 */
export function partnerPreferenceWhere(
  preference: PartnerPreferenceValues | null,
  now: Date = new Date(),
): Prisma.ProfileWhereInput {
  if (preference === null || !hasPartnerPreferenceConstraints(preference)) return {};

  const where: Prisma.ProfileWhereInput = {};

  if (preference.gender !== 'ANY') where.gender = preference.gender;

  const height: Prisma.IntNullableFilter = {};
  if (preference.height_min_cm !== null) height.gte = preference.height_min_cm;
  if (preference.height_max_cm !== null) height.lte = preference.height_max_cm;
  if (height.gte !== undefined || height.lte !== undefined) where.heightCm = height;

  const year = now.getUTCFullYear();
  const birth: Prisma.DateTimeFilter = {};
  // age_max bounds the oldest allowed: born on or after the start of that year.
  if (preference.age_max !== null) birth.gte = new Date(Date.UTC(year - preference.age_max, 0, 1));
  // age_min bounds the youngest allowed: born on or before the end of that year.
  if (preference.age_min !== null)
    birth.lte = new Date(Date.UTC(year - preference.age_min, 11, 31));
  if (birth.gte !== undefined || birth.lte !== undefined) where.dateOfBirth = birth;

  if (preference.marital_status !== null) where.maritalStatus = preference.marital_status;
  if (preference.religion !== null) {
    where.religion = { equals: preference.religion, mode: 'insensitive' };
  }
  if (preference.sub_caste !== null) {
    where.subCaste = { equals: preference.sub_caste, mode: 'insensitive' };
  }
  if (preference.education_id !== null) where.educationId = preference.education_id;
  if (preference.profession_id !== null) where.professionId = preference.profession_id;
  if (preference.mother_tongue !== null) {
    where.motherTongue = { equals: preference.mother_tongue, mode: 'insensitive' };
  }
  if (preference.country !== null) {
    where.country = { equals: preference.country.toUpperCase(), mode: 'insensitive' };
  }
  if (preference.state !== null) where.state = { equals: preference.state, mode: 'insensitive' };
  if (preference.city !== null) where.city = { equals: preference.city, mode: 'insensitive' };

  return where;
}

/**
 * Reads and writes the member's partner preferences.
 *
 * One row per user, shared with the two-way visibility flags but not with their
 * meaning: visibility decides who may see this member, this decides whom they
 * see. Saving a preference never touches the visibility lists, and vice versa.
 */
@Injectable()
export class PartnerPreferenceService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(userId: string): Promise<PartnerPreferenceState> {
    const row = await this.prisma.partnerPreference.findUnique({
      where: { userId },
      select: PREFERENCE_SELECT,
    });

    if (row === null) {
      // "Not configured" is not the same as "configured to no constraints": the
      // screen says so, and the discovery query is identical either way, so
      // nothing is implied about the member that they did not choose.
      return { preference: EMPTY_PREFERENCE, configured: false, updated_at: null };
    }

    return {
      preference: toPreferenceValues(row),
      configured: true,
      updated_at: row.updatedAt.toISOString(),
    };
  }

  async save(userId: string, input: UpdatePartnerPreferenceInput): Promise<PartnerPreferenceState> {
    const data = toPreferenceColumns(input);

    const row = await this.prisma.partnerPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      select: PREFERENCE_SELECT,
    });

    return {
      preference: toPreferenceValues(row),
      configured: true,
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
