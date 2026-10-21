import type { InterestOption } from '@matrimony/shared';
import { interestLabel, interestOptions } from './interests';

const catalogue: InterestOption[] = [
  { key: 'TRAVEL', label: 'Travel', sort_order: 10 },
  { key: 'MUSIC', label: 'Music', sort_order: 20 },
];

describe('interestOptions', () => {
  it('maps catalogue entries to picker rows in order', () => {
    expect(interestOptions(catalogue)).toEqual([
      { value: 'TRAVEL', label: 'Travel' },
      { value: 'MUSIC', label: 'Music' },
    ]);
  });

  it('returns no rows for an empty catalogue', () => {
    expect(interestOptions([])).toEqual([]);
  });
});

describe('interestLabel', () => {
  it('resolves a known key to its label', () => {
    expect(interestLabel(catalogue, 'MUSIC')).toBe('Music');
  });

  it('falls back to the raw key when the catalogue lacks it', () => {
    expect(interestLabel(catalogue, 'GARDENING')).toBe('GARDENING');
  });

  it('falls back to the raw key when there is no catalogue yet', () => {
    expect(interestLabel(undefined, 'TRAVEL')).toBe('TRAVEL');
  });
});
