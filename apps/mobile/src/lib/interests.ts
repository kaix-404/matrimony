import type { InterestOption } from '@matrimony/shared';

/** Picker rows for the curated catalogue, in the order the API returned it. */
export function interestOptions(
  catalogue: readonly InterestOption[],
): { value: string; label: string }[] {
  return catalogue.map((option) => ({ value: option.key, label: option.label }));
}

/**
 * The human label for a catalogue key. Falls back to the raw key so a stored
 * interest that is no longer in the catalogue still renders something, rather
 * than an empty chip that looks like a layout bug.
 */
export function interestLabel(
  catalogue: readonly InterestOption[] | undefined,
  key: string,
): string {
  return catalogue?.find((option) => option.key === key)?.label ?? key;
}
