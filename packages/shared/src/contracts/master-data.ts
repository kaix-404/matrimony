/**
 * Master-list contracts — spec section D3.
 *
 * Master data is admin-managed: the client maintains education levels,
 * professions, castes and communities from the admin dashboard. Two consequences
 * shape this file:
 *
 *   1. The client must not hardcode the values. New bands are added by an admin,
 *      and a release of the mobile app to do it would be absurd. It fetches them
 *      and caches.
 *   2. A value's `id` is opaque and must never be parsed. Values are looked up
 *      by id on save and resolved back to labels on read.
 *
 * `isSensitive` is returned but never used to hide a list from the owner — it
 * marks caste and community as more sensitive than education, which governs
 * consent wording and preview visibility (section 13), not whether the owner
 * may see their own value.
 */

import { z } from 'zod';

export const MasterListValueSchema = z
  .object({
    id: z.string().min(1),
    value: z.string().min(1),
    /**
     * Section of the list this value belongs to, or null for a flat list.
     * Education groups by degree family, occupation by industry, and sub-caste
     * by the religion it applies to — which is why the picker filters sub-castes
     * by the member's own religion rather than offering all 835 of them.
     */
    group: z.string().nullable(),
  })
  .strict();

export type MasterListValue = z.infer<typeof MasterListValueSchema>;

export const MasterListSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    is_sensitive: z.boolean(),
    values: MasterListValueSchema.array(),
  })
  .strict();

export type MasterList = z.infer<typeof MasterListSchema>;

export const MasterListsResponseSchema = z
  .object({
    lists: MasterListSchema.array(),
  })
  .strict();

export type MasterListsResponse = z.infer<typeof MasterListsResponseSchema>;

/** Master-list keys, seeded and referenced by the profile schema. */
export const MASTER_LIST_KEYS = [
  'RELIGION',
  'MOTHER_TONGUE',
  'EDUCATION',
  'PROFESSION',
  'CASTE',
  'COMMUNITY',
  'STATE',
] as const;
export type MasterListKey = (typeof MASTER_LIST_KEYS)[number];

/** The same keys as a schema, for validating a list key that arrives in a path. */
export const MasterListKeySchema = z.enum(MASTER_LIST_KEYS);

/**
 * Map a profile field to the list it draws from, so the server can validate ids
 * without a per-field switch at every call site.
 */
export const PROFILE_MASTER_LIST_FIELDS = {
  education_id: 'EDUCATION',
  profession_id: 'PROFESSION',
  community_id: 'COMMUNITY',
} as const satisfies Record<string, MasterListKey>;
