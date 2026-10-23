import { biodataValuesToPatch, summarizeExtraction } from './biodata';
import type { BiodataValue } from '@matrimony/shared';

/**
 * The mapper is the seam between a proposal (all strings, master-list fields as
 * text) and the API (typed fields, master-list fields as ids). The tests pin the
 * conversions that would otherwise fail at save time: a height string becoming a
 * number, a master-list value needing an id to be usable, and an empty selection
 * producing no body rather than an empty PATCH the API rejects.
 */
describe('biodataValuesToPatch', () => {
  it('maps a text field straight across', () => {
    const values: BiodataValue[] = [
      { field: 'religion', value: 'Hindu', confidence: 'high' },
      { field: 'city', value: 'Pune', confidence: 'high' },
    ];

    expect(biodataValuesToPatch(values)).toEqual({ religion: 'Hindu', city: 'Pune' });
  });

  it('converts height to a number', () => {
    const values: BiodataValue[] = [{ field: 'height_cm', value: '163', confidence: 'high' }];

    expect(biodataValuesToPatch(values)).toEqual({ height_cm: 163 });
  });

  it('drops a height that is out of range', () => {
    const values: BiodataValue[] = [{ field: 'height_cm', value: '900', confidence: 'high' }];

    expect(biodataValuesToPatch(values)).toBeNull();
  });

  it('sends a master-list field as its resolved id', () => {
    const values: BiodataValue[] = [
      { field: 'profession', value: 'Software Engineer', confidence: 'high', master_list_id: 'prof-1' },
    ];

    expect(biodataValuesToPatch(values)).toEqual({ profession_id: 'prof-1' });
  });

  it('drops a master-list field with no resolved id', () => {
    const values: BiodataValue[] = [
      { field: 'community', value: 'Some Caste', confidence: 'high' },
    ];

    expect(biodataValuesToPatch(values)).toBeNull();
  });

  it('returns null for an empty selection', () => {
    expect(biodataValuesToPatch([])).toBeNull();
  });
});

describe('summarizeExtraction', () => {
  it('counts the fields found', () => {
    const summary = summarizeExtraction({
      values: [{ field: 'city', value: 'Pune', confidence: 'high' }],
      unrecognised: [],
      warnings: [],
    });

    expect(summary).toContain('1 field');
  });

  it('reports when nothing was found', () => {
    const summary = summarizeExtraction({ values: [], unrecognised: [], warnings: [] });

    expect(summary).toMatch(/no fields/i);
  });
});
