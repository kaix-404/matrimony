import {
  extractBiodata,
  parseDateOfBirth,
  parseHeight,
  splitLines,
} from './biodata-parse';

/**
 * Biodata extraction tests.
 *
 * The parser is heuristics over free prose, so the tests pin the behaviours that
 * matter rather than a fixture's exact output: a labelled line is read, a
 * repeated label keeps the first (candidate) value, an ambiguous date is
 * refused rather than guessed, and a field with no match is reported missing.
 */

describe('splitLines', () => {
  it('reads `Label: value` pairs', () => {
    expect(splitLines('Name: Asha Rao\nHeight: 5\'4"')).toEqual([
      { label: 'Name', value: 'Asha Rao' },
      { label: 'Height', value: '5\'4"' },
    ]);
  });

  it('reads a label on one line and its value on the next', () => {
    expect(splitLines('Education\nB.E. Computer Science')).toEqual([
      { label: 'Education', value: 'B.E. Computer Science' },
    ]);
  });

  it('tolerates an en dash separator', () => {
    expect(splitLines('Religion \u2013 Hindu')).toEqual([
      { label: 'Religion', value: 'Hindu' },
    ]);
  });

  it('ignores blank lines', () => {
    expect(splitLines('\n\nName: Asha\n\n')).toEqual([{ label: 'Name', value: 'Asha' }]);
  });
});

describe('parseHeight', () => {
  it('reads feet and inches', () => {
    expect(parseHeight("5'4\"")).toBe('163');
    expect(parseHeight('5 ft 4 in')).toBe('163');
  });

  it('reads a bare decimal as feet.inches', () => {
    expect(parseHeight('5.4')).toBe('163');
  });

  it('reads centimetres as-is', () => {
    expect(parseHeight('160 cm')).toBe('160');
  });

  it('drops an implausible height rather than clamping it', () => {
    expect(parseHeight('1\'2"')).toBeNull();
    expect(parseHeight('35 ft')).toBeNull();
  });

  it('returns null when there is no height', () => {
    expect(parseHeight('tall')).toBeNull();
  });
});

describe('parseDateOfBirth', () => {
  it('reads an ISO date', () => {
    expect(parseDateOfBirth('1996-03-12')).toBe('1996-03-12');
  });

  it('reads dd/mm/yyyy, the Indian convention', () => {
    expect(parseDateOfBirth('12/03/1996')).toBe('1996-03-12');
  });

  it('normalises a two-digit year', () => {
    expect(parseDateOfBirth('12/03/96')).toBe('1996-03-12');
  });

  it('reads a named month', () => {
    expect(parseDateOfBirth('12 March 1996')).toBe('1996-03-12');
  });

  it('refuses a date that is not a real calendar day', () => {
    expect(parseDateOfBirth('31/02/1996')).toBeNull();
  });

  it('refuses a minor', () => {
    const thisYear = new Date().getUTCFullYear();
    expect(parseDateOfBirth(`01/01/${thisYear - 5}`)).toBeNull();
  });
});

describe('extractBiodata', () => {
  const BIODATA = `
    Matrimonial Biodata
    Name: Asha Rao
    Date of Birth: 12/03/1996
    Gender: Female
    Height: 5'4"
    Marital status: Never married
    Religion: Hindu
    Community: Brahmin
    Education: B.E. Computer Science
    Profession: Software Engineer
    Annual income: 18 LPA
    City: Pune
    Mother tongue: Marathi
  `;

  it('extracts the labelled fields', () => {
    const { values } = extractBiodata(BIODATA);
    const byField = Object.fromEntries(values.map((v) => [v.field, v.value]));

    expect(byField.first_name).toBe('Asha Rao');
    expect(byField.date_of_birth).toBe('1996-03-12');
    expect(byField.gender).toBe('FEMALE');
    expect(byField.height_cm).toBe('163');
    expect(byField.marital_status).toBe('NEVER_MARRIED');
    expect(byField.religion).toBe('Hindu');
    expect(byField.community).toBe('Brahmin');
    expect(byField.education).toBe('B.E. Computer Science');
    expect(byField.profession).toBe('Software Engineer');
    expect(byField.annual_income).toBe('18 LPA');
    expect(byField.city).toBe('Pune');
    expect(byField.mother_tongue).toBe('Marathi');
  });

  it('reports the fields it could not fill', () => {
    const { unrecognised } = extractBiodata(BIODATA);
    expect(unrecognised).toContain('fathers_occupation');
    expect(unrecognised).toContain('about_me');
    expect(unrecognised).not.toContain('first_name');
  });

  it('keeps the first value when a label repeats', () => {
    // A biodata often lists the candidate's name and then a parent's.
    const { values } = extractBiodata('Name: Asha Rao\nName: Ramesh Rao');
    expect(values.find((v) => v.field === 'first_name')?.value).toBe('Asha Rao');
  });

  it('tags a value taken from a labelled line as high confidence', () => {
    const { values } = extractBiodata('Religion: Hindu');
    expect(values.find((v) => v.field === 'religion')?.confidence).toBe('high');
  });

  it('returns everything as unrecognised for empty text', () => {
    const { values, unrecognised } = extractBiodata('');
    expect(values).toHaveLength(0);
    expect(unrecognised.length).toBeGreaterThan(0);
  });

  it('drops a field whose value does not parse rather than guessing', () => {
    const { values } = extractBiodata('Height: quite tall really');
    expect(values.find((v) => v.field === 'height_cm')).toBeUndefined();
  });
});
