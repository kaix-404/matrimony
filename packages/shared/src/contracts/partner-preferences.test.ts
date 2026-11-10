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
  mother_tongue: null,
  country: null,
  state: null,
  city: null,
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
  });

  it('counts any set field as a constraint', () => {
    expect(hasPartnerPreferenceConstraints({ ...EMPTY_VALUES, city: 'Pune' })).toBe(true);
    expect(hasPartnerPreferenceConstraints({ ...EMPTY_VALUES, sub_caste: 'Vokkaliga' })).toBe(true);
    expect(hasPartnerPreferenceConstraints({ ...EMPTY_VALUES, gender: 'FEMALE' })).toBe(true);
  });
});
