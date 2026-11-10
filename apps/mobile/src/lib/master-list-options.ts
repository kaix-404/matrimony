import type { MasterList } from '@matrimony/shared';

/**
 * The sub-caste block the client labelled "other Sub Cast".
 *
 * It is not a religion, but it holds the general Indian caste list (Agarwal,
 * Adi Dravidar, Vokkaliga, …) that the Hindu block does not repeat, so it is
 * offered to every religion alongside that religion's own block. Without it a
 * Hindu member would only see the 50 South Indian caste names in the "Hindu"
 * block.
 *
 * Shared between the profile and the partner preferences because both pick from
 * the same religion-scoped list, and a preference that offered a different set
 * of sub-castes from the profile would silently match nobody.
 */
export const SHARED_SUB_CASTE_GROUP = 'Other Sub Cast';

export interface LabelOption {
  value: string;
  label: string;
}

export function listFor(lists: MasterList[], key: string): MasterList | undefined {
  return lists.find((list) => list.key === key);
}

/** Options for a list whose rows are referenced by id (education, profession). */
export function idOptions(list: MasterList | undefined): LabelOption[] {
  return (list?.values ?? []).map((value) => ({ value: value.id, label: value.value }));
}

/** Options for a list whose value *is* the label (religion, mother tongue, state). */
export function textOptions(list: MasterList | undefined): LabelOption[] {
  return [...new Set((list?.values ?? []).map((value) => value.value))].map((value) => ({
    value,
    label: value,
  }));
}

/**
 * The sub-castes offered for a religion, plus the shared general list.
 *
 * An empty religion means no choice has been made: returning every block would
 * present 835 names in list order with no indication of which faith each one
 * belongs to.
 */
export function subCasteOptions(list: MasterList | undefined, religion: string): LabelOption[] {
  if (religion === '') return [];
  return (list?.values ?? [])
    .filter((value) => value.group === religion || value.group === SHARED_SUB_CASTE_GROUP)
    .map((value) => ({ value: value.value, label: value.value }));
}

/**
 * Keeps a stored value selectable when the admin has since retired it.
 *
 * Without this the field would render as "Not set" while the profile still
 * holds the old value, and the next save would silently clear it.
 */
export function withCurrent(options: LabelOption[], current: string): LabelOption[] {
  const value = current.trim();
  if (value === '' || options.some((option) => option.value === value)) return options;
  return [{ value, label: value }, ...options];
}
