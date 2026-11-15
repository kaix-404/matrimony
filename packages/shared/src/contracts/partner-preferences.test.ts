import {
  PartnerPreferenceValuesSchema,
  hasPartnerPreferenceConstraints,
  type PartnerPreferenceValues,
} from './partner-preferences';

const EMPTY_VALUES: PartnerPreferenceValues = {
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

describe('PartnerPreferenceValuesSchema', () => {
  it('accepts an empty preference as "no constraints"', () => {
    expect(hasPartnerPreferenceConstraints(EMPTY_VALUES)).toBe(false);
    expect(PartnerPreferenceValuesSchema.parse(EMPTY_VALUES)).toEqual(EMPTY_VALUES);
  });

  it('rejects a range whose top is below its bottom', () => {
    // The feed would otherwise answer "no profiles" for a preference the member
    // believed they had set, with nothing naming the reversed field.
    expect(() =>
      PartnerPreferenceValuesSchema.parse({ ...EMPTY_VALUES, age_min: 40, age_max: 30 }),
    ).toThrow(/Maximum age/);
    expect(() =>
      PartnerPreferenceValuesSchema.parse({
        ...EMPTY_VALUES,
        height_min_cm: 180,
        height_max_cm: 150,
      }),
    ).toThrow(/Maximum height/);
  });

  it('refuses ages that are not adults', () => {
    expect(() => PartnerPreferenceValuesSchema.parse({ ...EMPTY_VALUES, age_min: 17 })).toThrow();
  });

  it('stores an empty text field as no constraint rather than an empty string', () => {
    const parsed = PartnerPreferenceValuesSchema.parse({ ...EMPTY_VALUES, religion: '   ' });
    expect(parsed.religion).toBeNull();
    expect(
      PartnerPreferenceValuesSchema.parse({ ...EMPTY_VALUES, education_id: '  ' }).education_id,
    ).toBeNull();
  });

  it('accepts the client\'s added preference answers and their compulsory ticks', () => {
    const parsed = PartnerPreferenceValuesSchema.parse({
      ...EMPTY_VALUES,
      physical_status: ['NORMAL'],
      eating_habits: ['Vegetarian', 'Eggetarian'],
      drinking_habits: ['Non-drinker'],
      smoking_habits: ['Non-smoker'],
      kuja_dosham: ['NO', 'DONT_KNOW'],
      employed_in: ['Government', 'Private'],
      annual_income_bands: ['₹5-10 lakh'],
      compulsory: ['eating', 'country'],
    });
    expect(parsed.compulsory).toEqual(['eating', 'country']);
    expect(hasPartnerPreferenceConstraints(parsed)).toBe(true);
  });

  it('refuses an answer outside the lists the app offers', () => {
    // A free-form habit would never match a profile, so it is refused at the
    // contract rather than saved as a preference that silently does nothing.
    expect(() =>
      PartnerPreferenceValuesSchema.parse({ ...EMPTY_VALUES, eating_habits: ['Jain'] }),
    ).toThrow();
    expect(() =>
      PartnerPreferenceValuesSchema.parse({ ...EMPTY_VALUES, compulsory: ['favourite_colour'] }),
    ).toThrow();
  });

  it('does not count a compulsory tick as a constraint on its own', () => {
    expect(hasPartnerPreferenceConstraints({ ...EMPTY_VALUES, compulsory: ['country'] })).toBe(false);
  });

  it('counts any set field as a constraint', () => {
    expect(hasPartnerPreferenceConstraints({ ...EMPTY_VALUES, city: 'Pune' })).toBe(true);
    expect(hasPartnerPreferenceConstraints({ ...EMPTY_VALUES, sub_caste: 'Vokkaliga' })).toBe(true);
    expect(hasPartnerPreferenceConstraints({ ...EMPTY_VALUES, education_id: 'clx123' })).toBe(true);
    expect(hasPartnerPreferenceConstraints({ ...EMPTY_VALUES, gender: 'FEMALE' })).toBe(true);
  });
});
