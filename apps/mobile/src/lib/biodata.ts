import type { BiodataExtraction, BiodataValue, UpdateProfileInput } from '@matrimony/shared';

/**
 * Turns an extraction proposal into a profile update body.
 *
 * The two things this has to get right:
 *
 *  - The API's field names are snake_case (`mother_tongue`) while the value's
 *    `field` is already that name, so most fields copy across directly — except
 *    the three master-list fields, which the API wants as `*_id` and which the
 *    proposal carries as `master_list_id`.
 *  - `height_cm` arrives as a string from the parser (so the review UI can show
 *    it in a text box) but the API wants a number, and a value without one is
 *    dropped rather than sent as NaN.
 *
 * It only ever sets fields the user accepted: the caller passes the values it
 * kept, and an empty body is returned as `null` so the screen can disable Save
 * rather than PATCH nothing (the API rejects an empty update).
 */
export function biodataValuesToPatch(values: BiodataValue[]): UpdateProfileInput | null {
  const payload: Record<string, unknown> = {};

  const masterList: Partial<Record<BiodataValue['field'], string>> = {
    education: 'education_id',
    profession: 'profession_id',
    community: 'community_id',
  };

  for (const value of values) {
    const listKey = masterList[value.field];
    if (listKey) {
      // A master-list value is only usable with the id the API resolved; without
      // it, sending the text would be rejected, so it is skipped.
      if (value.master_list_id) payload[listKey] = value.master_list_id;
      continue;
    }

    if (value.field === 'height_cm') {
      const cm = Number.parseInt(value.value, 10);
      if (Number.isInteger(cm) && cm >= 90 && cm <= 250) payload.height_cm = cm;
      continue;
    }

    payload[value.field] = value.value;
  }

  return Object.keys(payload).length > 0 ? (payload as UpdateProfileInput) : null;
}

/** A short human summary of a proposal, for the review screen's heading. */
export function summarizeExtraction(extraction: BiodataExtraction): string {
  const n = extraction.values.length;
  if (n === 0) return 'No fields could be read from this document.';
  return `Found ${n} field${n === 1 ? '' : 's'} to review.`;
}
