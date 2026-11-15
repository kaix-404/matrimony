import { Injectable } from '@nestjs/common';
import type { Prisma } from '../prisma/prisma-client';
import { PrismaClient } from '../prisma/prisma-client';
import type {
  PartnerPreferenceState,
  PartnerPreferenceValues,
  PreferenceFilterKey,
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
  physical_status: [],
  eating_habits: [],
  drinking_habits: [],
  smoking_habits: [],
  kuja_dosham: [],
  employed_in: [],
  annual_income_bands: [],
  compulsory: [],
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
  physicalStatus: string[];
  eatingHabits: string[];
  drinkingHabits: string[];
  smokingHabits: string[];
  kujaDosham: string[];
  employedIn: string[];
  annualIncomeBands: string[];
  compulsoryFilters: string[];
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
  physicalStatus: true,
  eatingHabits: true,
  drinkingHabits: true,
  smokingHabits: true,
  kujaDosham: true,
  employedIn: true,
  annualIncomeBands: true,
  compulsoryFilters: true,
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
    physical_status: row.physicalStatus as PartnerPreferenceValues['physical_status'],
    eating_habits: row.eatingHabits as PartnerPreferenceValues['eating_habits'],
    drinking_habits: row.drinkingHabits as PartnerPreferenceValues['drinking_habits'],
    smoking_habits: row.smokingHabits as PartnerPreferenceValues['smoking_habits'],
    kuja_dosham: row.kujaDosham as PartnerPreferenceValues['kuja_dosham'],
    employed_in: row.employedIn as PartnerPreferenceValues['employed_in'],
    annual_income_bands:
      row.annualIncomeBands as PartnerPreferenceValues['annual_income_bands'],
    compulsory: row.compulsoryFilters as PartnerPreferenceValues['compulsory'],
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
    physicalStatus: input.physical_status,
    eatingHabits: input.eating_habits,
    drinkingHabits: input.drinking_habits,
    smokingHabits: input.smoking_habits,
    kujaDosham: input.kuja_dosham,
    employedIn: input.employed_in,
    annualIncomeBands: input.annual_income_bands,
    compulsoryFilters: input.compulsory,
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
  only?: ReadonlySet<PreferenceFilterKey>,
): Prisma.ProfileWhereInput {
  if (preference === null || !hasPartnerPreferenceConstraints(preference)) return {};

  // One rule, no exceptions: only the answers the member ticked as compulsory
  // remove anybody. `only` is for the mutual direction, where a candidate's own
  // ticks are evaluated explicitly; it defaults to this preference's own ticks.
  const ticked = only ?? new Set<PreferenceFilterKey>(preference.compulsory);
  const applies = (key: PreferenceFilterKey): boolean => ticked.has(key);

  const where: Prisma.ProfileWhereInput = {};

  if (applies('gender') && preference.gender !== 'ANY') where.gender = preference.gender;

  if (applies('height')) {
    const height: Prisma.IntNullableFilter = {};
    if (preference.height_min_cm !== null) height.gte = preference.height_min_cm;
    if (preference.height_max_cm !== null) height.lte = preference.height_max_cm;
    if (height.gte !== undefined || height.lte !== undefined) where.heightCm = height;
  }

  if (applies('age') && (preference.age_min !== null || preference.age_max !== null)) {
    const year = now.getUTCFullYear();
    const birth: Prisma.DateTimeFilter = {};
    // age_max bounds the oldest allowed: born on or after the start of that year.
    if (preference.age_max !== null)
      birth.gte = new Date(Date.UTC(year - preference.age_max, 0, 1));
    // age_min bounds the youngest allowed: born on or before the end of that year.
    if (preference.age_min !== null)
      birth.lte = new Date(Date.UTC(year - preference.age_min, 11, 31));
    where.dateOfBirth = birth;
  }

  if (applies('marital_status') && preference.marital_status !== null) {
    where.maritalStatus = preference.marital_status;
  }
  if (applies('religion') && preference.religion !== null) {
    where.religion = { equals: preference.religion, mode: 'insensitive' };
  }
  if (applies('sub_caste') && preference.sub_caste !== null) {
    where.subCaste = { equals: preference.sub_caste, mode: 'insensitive' };
  }
  if (applies('education') && preference.education_id !== null) {
    where.educationId = preference.education_id;
  }
  if (applies('occupation') && preference.profession_id !== null) {
    where.professionId = preference.profession_id;
  }
  if (applies('mother_tongue') && preference.mother_tongue !== null) {
    where.motherTongue = { equals: preference.mother_tongue, mode: 'insensitive' };
  }
  if (applies('country') && preference.country !== null) {
    where.country = { equals: preference.country.toUpperCase(), mode: 'insensitive' };
  }
  if (applies('state') && preference.state !== null) {
    where.state = { equals: preference.state, mode: 'insensitive' };
  }
  if (applies('city') && preference.city !== null) {
    where.city = { equals: preference.city, mode: 'insensitive' };
  }

  // The client's added questions. Sets rather than single values, so "any of
  // these is fine" — the reference's "Doesn't matter" row beside a chosen answer.
  if (applies('physical_status') && preference.physical_status.length > 0) {
    where.physicalStatus = { in: preference.physical_status };
  }
  if (applies('eating') && preference.eating_habits.length > 0) {
    where.foodPreference = { in: preference.eating_habits };
  }
  if (applies('drinking') && preference.drinking_habits.length > 0) {
    where.drinking = { in: preference.drinking_habits };
  }
  if (applies('smoking') && preference.smoking_habits.length > 0) {
    where.smoking = { in: preference.smoking_habits };
  }
  if (applies('kuja_dosham') && preference.kuja_dosham.length > 0) {
    where.manglikStatus = { in: preference.kuja_dosham };
  }
  if (applies('employed_in') && preference.employed_in.length > 0) {
    where.employedIn = { in: preference.employed_in };
  }

  // Annual income is deliberately not applied: the client instructed that income
  // stays free text on the profile (D3), so there is no band column to compare
  // these bands against. Storing the answer keeps it on the screen the reference
  // shows; filtering on it waits for a structured income column.

  return where;
}

/**
 * The facts a candidate's compulsory filters are tested against.
 *
 * A structural snapshot of the *viewer's* profile, not the stored row: the
 * predicate is evaluation, not storage, and taking only what it compares keeps
 * it testable without a database.
 */
export interface ViewerProfileFacts {
  gender: string;
  dateOfBirth: Date;
  heightCm: number | null;
  maritalStatus: string | null;
  religion: string | null;
  subCaste: string | null;
  motherTongue: string | null;
  educationId: string | null;
  professionId: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  physicalStatus: string | null;
  foodPreference: string | null;
  drinking: string | null;
  smoking: string | null;
  manglikStatus: string | null;
  employedIn: string | null;
}

/** Completed years, in UTC, so a birthday does not depend on the server's zone. */
export function ageInYears(dateOfBirth: Date, now: Date): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const month = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) age -= 1;
  return age;
}

/** Case-insensitive equality where the stored value is a label. */
const is = (stored: string | null, wanted: string): boolean =>
  stored !== null && stored.toLowerCase() === wanted.toLowerCase();

/**
 * Whether this viewer survives a candidate's compulsory filters.
 *
 * The mirror image of `partnerPreferenceWhere`: that asks which profiles match a
 * preference, this asks whether one profile does. Both use the same rule — only
 * ticked answers count — so a member cannot exclude others on a question they
 * would not themselves be excluded by.
 *
 * An unset profile field fails a ticked question. Same reasoning as the forward
 * direction: a member who ticked "Hindu" has not accepted "religion unknown".
 * Annual income is not tested because it is stored as free text (client
 * instruction D3) and no band can be compared against it.
 */
export function meetsCompulsoryFilters(
  preference: PartnerPreferenceValues,
  viewer: ViewerProfileFacts,
  now: Date = new Date(),
): boolean {
  const ticked = new Set<PreferenceFilterKey>(preference.compulsory);
  if (ticked.size === 0) return true;

  if (ticked.has('gender') && preference.gender !== 'ANY' && viewer.gender !== preference.gender) {
    return false;
  }

  if (ticked.has('age')) {
    const age = ageInYears(viewer.dateOfBirth, now);
    if (preference.age_min !== null && age < preference.age_min) return false;
    if (preference.age_max !== null && age > preference.age_max) return false;
  }

  if (ticked.has('height')) {
    const height = viewer.heightCm;
    if (preference.height_min_cm !== null && (height === null || height < preference.height_min_cm)) {
      return false;
    }
    if (preference.height_max_cm !== null && (height === null || height > preference.height_max_cm)) {
      return false;
    }
  }

  if (
    ticked.has('marital_status') &&
    preference.marital_status !== null &&
    viewer.maritalStatus !== preference.marital_status
  ) {
    return false;
  }

  if (ticked.has('religion') && preference.religion !== null && !is(viewer.religion, preference.religion)) {
    return false;
  }
  if (
    ticked.has('sub_caste') &&
    preference.sub_caste !== null &&
    !is(viewer.subCaste, preference.sub_caste)
  ) {
    return false;
  }
  if (
    ticked.has('mother_tongue') &&
    preference.mother_tongue !== null &&
    !is(viewer.motherTongue, preference.mother_tongue)
  ) {
    return false;
  }
  if (ticked.has('country') && preference.country !== null && !is(viewer.country, preference.country)) {
    return false;
  }
  if (ticked.has('state') && preference.state !== null && !is(viewer.state, preference.state)) {
    return false;
  }
  if (ticked.has('city') && preference.city !== null && !is(viewer.city, preference.city)) {
    return false;
  }

  if (
    ticked.has('education') &&
    preference.education_id !== null &&
    viewer.educationId !== preference.education_id
  ) {
    return false;
  }
  if (
    ticked.has('occupation') &&
    preference.profession_id !== null &&
    viewer.professionId !== preference.profession_id
  ) {
    return false;
  }

  /** Membership in a ticked set; an empty set is "any", and an unset fails. */
  const inSet = (stored: string | null, allowed: string[]): boolean =>
    allowed.length === 0 || (stored !== null && allowed.includes(stored));

  if (ticked.has('physical_status') && !inSet(viewer.physicalStatus, preference.physical_status)) {
    return false;
  }
  if (ticked.has('eating') && !inSet(viewer.foodPreference, preference.eating_habits)) return false;
  if (ticked.has('drinking') && !inSet(viewer.drinking, preference.drinking_habits)) return false;
  if (ticked.has('smoking') && !inSet(viewer.smoking, preference.smoking_habits)) return false;
  if (ticked.has('kuja_dosham') && !inSet(viewer.manglikStatus, preference.kuja_dosham)) return false;
  if (ticked.has('employed_in') && !inSet(viewer.employedIn, preference.employed_in)) return false;

  return true;
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

  /**
   * The compulsory filters of several candidates at once, keyed by user id.
   *
   * Rows with no ticks are skipped in the query rather than read and discarded:
   * on a full page that is the common case, and they can exclude nobody.
   */
  async compulsoryFiltersFor(userIds: string[]): Promise<Map<string, PartnerPreferenceValues>> {
    if (userIds.length === 0) return new Map();

    const rows = await this.prisma.partnerPreference.findMany({
      where: { userId: { in: userIds }, compulsoryFilters: { isEmpty: false } },
      select: { userId: true, ...PREFERENCE_SELECT },
    });

    return new Map(rows.map((row) => [row.userId, toPreferenceValues(row)]));
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
