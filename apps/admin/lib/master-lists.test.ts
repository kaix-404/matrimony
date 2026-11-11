import type { AdminMasterListValueView } from '@matrimony/shared';
import { groupValues, hasSections, visibleValues, VISIBLE_VALUE_LIMIT } from './master-lists';

/**
 * The console's list view.
 *
 * These helpers decide what an administrator can see, so the properties worth
 * asserting are the ones that would otherwise hide work: a section keeps the
 * client's order, a flat list is not mistaken for a grouped one, and a search
 * that matches more than the cap says so instead of looking complete.
 */

function value(id: string, label: string, group: string | null): AdminMasterListValueView {
  return { id, value: label, group, is_active: true, sort_order: 1 };
}

describe('groupValues', () => {
  it('keeps a flat list as one section', () => {
    const sections = groupValues([value('1', 'Odisha', null), value('2', 'Goa', null)]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.group).toBeNull();
    expect(sections[0]?.values.map((row) => row.value)).toEqual(['Odisha', 'Goa']);
  });

  it('splits sections in the order the API returned them', () => {
    const sections = groupValues([
      value('1', 'Hindu', 'Hindu'),
      value('2', 'Ad Dharmi', 'Hindu'),
      value('3', 'Muslim', 'Muslim - Sunni'),
    ]);
    expect(sections.map((section) => section.group)).toEqual(['Hindu', 'Muslim - Sunni']);
    expect(sections[0]?.values.map((row) => row.value)).toEqual(['Hindu', 'Ad Dharmi']);
  });

  it('returns nothing for an empty list', () => {
    expect(groupValues([])).toEqual([]);
  });
});

describe('hasSections', () => {
  it('is true only when the values carry a section', () => {
    expect(hasSections(groupValues([value('1', 'Odisha', null)]))).toBe(false);
    expect(hasSections(groupValues([value('1', 'Hindu', 'Hindu')]))).toBe(true);
    expect(hasSections([])).toBe(false);
  });
});

describe('visibleValues', () => {
  const values = [
    value('1', 'Andhra Pradesh', null),
    value('2', 'Odisha', null),
    value('3', 'Pondicherry', null),
  ];

  it('shows everything when nothing is searched', () => {
    const result = visibleValues(values, '');
    expect(result.shown).toHaveLength(3);
    expect(result.truncated).toBe(false);
  });

  it('matches a value case-insensitively', () => {
    const result = visibleValues(values, 'odis');
    expect(result.shown.map((row) => row.value)).toEqual(['Odisha']);
    expect(result.total).toBe(1);
  });

  it('matches the section name as well as the value', () => {
    const result = visibleValues([value('1', 'Ad Dharmi', 'Hindu')], 'hindu');
    expect(result.shown).toHaveLength(1);
  });

  it('caps the rows and reports that it did', () => {
    const many = Array.from({ length: VISIBLE_VALUE_LIMIT + 5 }, (_, index) =>
      value(String(index), `Value ${index}`, null),
    );
    const result = visibleValues(many, '');
    expect(result.shown).toHaveLength(VISIBLE_VALUE_LIMIT);
    expect(result.total).toBe(VISIBLE_VALUE_LIMIT + 5);
    expect(result.truncated).toBe(true);
  });

  it('matches nothing rather than everything for an unmatched search', () => {
    const result = visibleValues(values, 'zzz');
    expect(result.shown).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.truncated).toBe(false);
  });
});
