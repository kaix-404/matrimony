import { DISTRICT_VALUES } from '../../prisma/district-values';
import { STATE_VALUES } from '../../prisma/master-data-values';

/**
 * District coverage, pinned per state.
 *
 * The district list is the one master list with no client file behind it, which
 * is how it drifted: it still carried the 13 districts Andhra Pradesh had before
 * the 2022 reorganisation, Rajasthan's pre-2023 33, no Andaman & Nicobar at all,
 * and ten villages for Lakshadweep. Nothing failed, because the picker simply
 * offered less than it should have and no member can report an absent option.
 *
 * So this pins the count of each state's group. Changing a state's districts is
 * expected — a reorganisation is a real event — but it has to change this table
 * in the same commit, which is what makes the diff visible in review.
 */
const EXPECTED_DISTRICTS: Record<string, number> = {
  'Andaman & Nicobar': 3,
  'Andhra Pradesh': 28,
  'Arunachal Pradesh': 27,
  Assam: 35,
  Bihar: 38,
  Chandigarh: 1,
  Chhattisgarh: 33,
  'Dadra & Nagar Haveli and Daman & Diu': 3,
  'Delhi / NCR': 11,
  Goa: 2,
  Gujarat: 33,
  Haryana: 22,
  'Himachal Pradesh': 12,
  'Jammu & Kashmir': 20,
  Jharkhand: 24,
  Karnataka: 31,
  Kerala: 14,
  Ladakh: 8,
  Lakshadweep: 1,
  'Madhya Pradesh': 55,
  Maharashtra: 36,
  Manipur: 16,
  Meghalaya: 12,
  Mizoram: 11,
  Nagaland: 17,
  Odisha: 30,
  Punjab: 23,
  Puducherry: 4,
  Rajasthan: 41,
  Sikkim: 6,
  'Tamil Nadu': 38,
  Telangana: 33,
  Tripura: 8,
  'Uttar Pradesh': 75,
  Uttarakhand: 13,
  'West Bengal': 23,
};

/** Every district, grouped by state, in the order the picker receives them. */
function districtsByState(): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const entry of DISTRICT_VALUES) {
    const group = entry.group ?? '';
    const existing = groups.get(group);
    if (existing) existing.push(entry.value);
    else groups.set(group, [entry.value]);
  }
  return groups;
}

describe('district values', () => {
  const groups = districtsByState();

  it('lists the number of districts each state publishes', () => {
    const actual = Object.fromEntries(
      [...groups.entries()].map(([group, values]) => [group, values.length]).sort(),
    );

    expect(actual).toEqual(Object.fromEntries(Object.entries(EXPECTED_DISTRICTS).sort()));
  });

  it('gives every state in the STATE list a district group', () => {
    const missing = STATE_VALUES.filter(
      (state) => (groups.get(state.value) ?? []).length === 0,
    ).map((state) => state.value);

    expect(missing).toEqual([]);
  });

  it('files no district under a state the picker cannot offer', () => {
    const offered = new Set(STATE_VALUES.map((state) => state.value));
    const orphans = [...groups.keys()].filter((group) => !offered.has(group));

    expect(orphans).toEqual([]);
  });

  it('has no blank, padded or repeated district inside a group', () => {
    const seen = new Set<string>();
    const problems: string[] = [];

    for (const entry of DISTRICT_VALUES) {
      const group = entry.group ?? '';
      if (entry.value !== entry.value.trim()) problems.push(`padded: "${entry.value}"`);
      if (entry.value.trim() === '') problems.push(`blank in ${group}`);
      const key = `${group}\u0000${entry.value}`;
      if (seen.has(key)) problems.push(`repeated: ${entry.value} in ${group}`);
      seen.add(key);
    }

    expect(problems).toEqual([]);
  });

  it('keeps each group alphabetical, so an added district has an obvious home', () => {
    const unsorted = [...groups.entries()]
      .filter(([, values]) => {
        const sorted = [...values].sort((a, b) => a.localeCompare(b));
        return values.join('\u0000') !== sorted.join('\u0000');
      })
      .map(([group]) => group);

    expect(unsorted).toEqual([]);
  });
});
