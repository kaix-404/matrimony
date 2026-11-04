"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROFILE_MASTER_LIST_FIELDS = exports.MASTER_LIST_KEYS = exports.MasterListsResponseSchema = exports.MasterListSchema = exports.MasterListValueSchema = void 0;
const zod_1 = require("zod");
exports.MasterListValueSchema = zod_1.z
    .object({
    id: zod_1.z.string().min(1),
    value: zod_1.z.string().min(1),
})
    .strict();
exports.MasterListSchema = zod_1.z
    .object({
    key: zod_1.z.string().min(1),
    label: zod_1.z.string().min(1),
    is_sensitive: zod_1.z.boolean(),
    values: exports.MasterListValueSchema.array(),
})
    .strict();
exports.MasterListsResponseSchema = zod_1.z
    .object({
    lists: exports.MasterListSchema.array(),
})
    .strict();
/** Master-list keys, seeded and referenced by the profile schema. */
exports.MASTER_LIST_KEYS = ['EDUCATION', 'PROFESSION', 'CASTE', 'COMMUNITY'];
/**
 * Map a profile field to the list it draws from, so the server can validate ids
 * without a per-field switch at every call site.
 */
exports.PROFILE_MASTER_LIST_FIELDS = {
    education_id: 'EDUCATION',
    profession_id: 'PROFESSION',
    community_id: 'COMMUNITY',
};
//# sourceMappingURL=master-data.js.map