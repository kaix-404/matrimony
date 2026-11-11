import type { AdminMasterListValueView } from '@matrimony/shared';

/**
 * How many values one page of a section renders.
 *
 * The sub-caste list holds 835 values and most sit under a single religion, so
 * rendering them all would make the page slow to open and impossible to scan. A
 * search box and a cap keep it usable; the cap is stated on screen rather than
 * silently dropping rows, because an administrator who cannot find a value has
 * to know whether it is missing or merely below the fold.
 */
export const VISIBLE_VALUE_LIMIT = 60;

export interface ValueSection {
  group: string | null;
  values: AdminMasterListValueView[];
}

/**
 * Groups values by the section the API already sorted them into.
 *
 * Consecutive grouping rather than a map: the API orders by section, so sequence
 * *is* the grouping, and preserving it keeps the client's order intact instead
 * of re-alphabetising a list they ordered deliberately.
 */
export function groupValues(values: readonly AdminMasterListValueView[]): ValueSection[] {
  const sections: ValueSection[] = [];
  for (const value of values) {
    const current = sections[sections.length - 1];
    if (current !== undefined && current.group === value.group) {
      current.values.push(value);
    } else {
      sections.push({ group: value.group, values: [value] });
    }
  }
  return sections;
}

/** True when the list divides its values into sections (education, occupation, sub-caste). */
export function hasSections(sections: readonly ValueSection[]): boolean {
  return sections.length > 0 && sections[0] !== undefined && sections[0].group !== null;
}

export interface VisibleValues {
  shown: AdminMasterListValueView[];
  /** How many values matched the search, which can exceed what is shown. */
  total: number;
  truncated: boolean;
}

/**
 * The values a search shows, capped.
 *
 * The section name is searched too: an administrator looking for a value they
 * know is under "Muslim - Sunni" should be able to type the religion rather than
 * scroll.
 */
export function visibleValues(
  values: readonly AdminMasterListValueView[],
  query: string,
  limit: number = VISIBLE_VALUE_LIMIT,
): VisibleValues {
  const needle = query.trim().toLowerCase();
  const matches =
    needle.length === 0
      ? values
      : values.filter(
          (value) =>
            value.value.toLowerCase().includes(needle) ||
            (value.group ?? '').toLowerCase().includes(needle),
        );

  const shown = matches.slice(0, limit);
  return { shown, total: matches.length, truncated: matches.length > shown.length };
}
