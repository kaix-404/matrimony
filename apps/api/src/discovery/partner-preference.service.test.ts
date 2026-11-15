import {
  EMPTY_PREFERENCE,
  PREFERENCE_SELECT,
  partnerPreferenceWhere,
  toPreferenceColumns,
  toPreferenceValues,
} from './partner-preference.service';
import { Prisma } from '../prisma/prisma-client';
import type { PartnerPreferenceValues } from '@matrimony/shared';

/** A fixed clock: the age bounds are derived from the year, so the test owns it. */
const NOW = new Date('2026-11-09T00:00:00Z');

function preference(overrides: Partial<PartnerPreferenceValues> = {}): PartnerPreferenceValues {
  return { ...EMPTY_PREFERENCE, ...overrides };
}

/**
 * What a saved preference turns into as a discovery predicate.
 *
 * Three properties matter. An unsaved preference must add nothing at all — a
 * default that narrowed the feed would be a filter the member never set. A saved
 * one must express every field it carries, or saving would look like it worked
 * and change nothing. And the age window must be a date range, because that is
 * the only form the database can answer from an index on birth date.
 */
/**
 * The column names this service reads and writes.
 *
 * A `select` or create object naming a column the model does not have passes
 * TypeScript when it is passed as a variable, so it reaches production as a
 * Prisma validation error — the preference screen and the discovery feed both
 * answered 500 for exactly that reason (they asked for `country` where the model
 * says `preferredCountry`). Checking the keys against Prisma's own field list is
 * what turns that into a failing test.
 */
describe('partner preference columns', () => {
  const modelFields: string[] = Object.values(Prisma.PartnerPreferenceScalarFieldEnum);

  it('selects only columns the model has', () => {
    for (const column of Object.keys(PREFERENCE_SELECT)) {
      expect(modelFields).toContain(column);
    }
  });

  it('writes only columns the model has', () => {
    const columns = toPreferenceColumns({ ...EMPTY_PREFERENCE, country: 'in' });

    expect(Object.keys(columns).length).toBeGreaterThan(0);
    for (const column of Object.keys(columns)) {
      expect(modelFields).toContain(column);
    }
  });

  it('maps the stored columns to the wire shape', () => {
    const values = toPreferenceValues({
      gender: 'ANY',
      ageMin: null,
      ageMax: null,
      heightMinCm: null,
      heightMaxCm: null,
      maritalStatus: null,
      religion: 'Hindu',
      subCaste: 'Vokkaliga',
      educationId: 'clx_education',
      professionId: null,
      motherTongue: null,
      preferredCountry: 'IN',
      preferredState: 'Karnataka',
      preferredCity: null,
      physicalStatus: [],
      eatingHabits: ['Vegetarian'],
      drinkingHabits: [],
      smokingHabits: [],
      kujaDosham: [],
      employedIn: [],
      annualIncomeBands: [],
      compulsoryFilters: ['eating'],
      updatedAt: new Date('2026-11-10T00:00:00Z'),
    });

    expect(values).toMatchObject({
      religion: 'Hindu',
      sub_caste: 'Vokkaliga',
      education_id: 'clx_education',
      profession_id: null,
      country: 'IN',
      state: 'Karnataka',
      city: null,
      eating_habits: ['Vegetarian'],
      compulsory: ['eating'],
    });
  });
});

describe('partnerPreferenceWhere', () => {
  it('adds no predicate when nothing has been saved', () => {
    expect(partnerPreferenceWhere(null, NOW)).toEqual({});
    expect(partnerPreferenceWhere(EMPTY_PREFERENCE, NOW)).toEqual({});
  });

  it('turns an age window into inclusive birth-date bounds', () => {
    const where = partnerPreferenceWhere(preference({ age_min: 30, age_max: 40 }), NOW);

    // 40 years old in 2026 means born in 1986 or later...
    expect(where.dateOfBirth).toEqual({
      gte: new Date(Date.UTC(1986, 0, 1)),
      lte: new Date(Date.UTC(1996, 11, 31)),
    });
  });

  it('bounds height only by the ends that were set', () => {
    expect(partnerPreferenceWhere(preference({ height_min_cm: 155 }), NOW).heightCm).toEqual({
      gte: 155,
    });
    expect(
      partnerPreferenceWhere(preference({ height_min_cm: 155, height_max_cm: 180 }), NOW).heightCm,
    ).toEqual({ gte: 155, lte: 180 });
  });

  it('matches text fields without regard to case', () => {
    const where = partnerPreferenceWhere(preference({ religion: 'Hindu', city: 'Pune' }), NOW);

    expect(where.religion).toEqual({ equals: 'Hindu', mode: 'insensitive' });
    expect(where.city).toEqual({ equals: 'Pune', mode: 'insensitive' });
  });

  it('matches education and profession by master-list id', () => {
    // By id, not label: the lists repeat a label across sections, so a label
    // would pull in profiles from the wrong section.
    const where = partnerPreferenceWhere(
      preference({ education_id: 'education_1', profession_id: 'profession_2' }),
      NOW,
    );

    expect(where.educationId).toBe('education_1');
    expect(where.professionId).toBe('profession_2');
  });

  it('narrows by sub-caste independently of religion', () => {
    // Sub-caste is religion-scoped on the profile, so a member who picked one
    // without a religion is asking for that caste only, not for any caste of
    // an unspecified faith.
    expect(partnerPreferenceWhere(preference({ sub_caste: 'Vokkaliga' }), NOW).subCaste).toEqual({
      equals: 'Vokkaliga',
      mode: 'insensitive',
    });
  });

  it('uppercases a country code to match how profiles store one', () => {
    expect(partnerPreferenceWhere(preference({ country: 'in' }), NOW).country).toEqual({
      equals: 'IN',
      mode: 'insensitive',
    });
  });

  it('treats ANY as no gender filter', () => {
    expect(partnerPreferenceWhere(preference({ gender: 'ANY' }), NOW).gender).toBeUndefined();
    expect(partnerPreferenceWhere(preference({ gender: 'FEMALE' }), NOW).gender).toBe('FEMALE');
  });

  it("matches the client's added answers as sets", () => {
    const where = partnerPreferenceWhere(
      preference({
        physical_status: ['NORMAL'],
        eating_habits: ['Vegetarian', 'Eggetarian'],
        drinking_habits: ['Non-drinker'],
        smoking_habits: ['Non-smoker'],
        kuja_dosham: ['NO'],
        employed_in: ['Government', 'Private'],
      }),
      NOW,
    );

    // "Any of these" — the reference's set of acceptable answers, not one value.
    expect(where.physicalStatus).toEqual({ in: ['NORMAL'] });
    expect(where.foodPreference).toEqual({ in: ['Vegetarian', 'Eggetarian'] });
    expect(where.drinking).toEqual({ in: ['Non-drinker'] });
    expect(where.smoking).toEqual({ in: ['Non-smoker'] });
    expect(where.manglikStatus).toEqual({ in: ['NO'] });
    expect(where.employedIn).toEqual({ in: ['Government', 'Private'] });
  });

  it('applies only the ticked fields when a compulsory set is given', () => {
    const saved = preference({ religion: 'Hindu', country: 'IN', eating_habits: ['Vegan'] });
    const where = partnerPreferenceWhere(saved, NOW, new Set(['country']));

    expect(where.country).toEqual({ equals: 'IN', mode: 'insensitive' });
    expect(where.religion).toBeUndefined();
    expect(where.foodPreference).toBeUndefined();
  });

  it('applies nothing when the compulsory set names a field that is unset', () => {
    const saved = preference({ religion: 'Hindu' });
    expect(partnerPreferenceWhere(saved, NOW, new Set(['country']))).toEqual({});
  });

  it('saves an income band without filtering on it', () => {
    // Profile income is free text by the client's instruction (D3), so there is
    // no band column to compare against; the answer is kept, not applied.
    const where = partnerPreferenceWhere(
      preference({ annual_income_bands: ['₹10-20 lakh'] }),
      NOW,
    );
    expect(where.annualIncome).toBeUndefined();
  });
});
