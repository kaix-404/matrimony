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
export declare const MasterListValueSchema: z.ZodObject<{
    id: z.ZodString;
    value: z.ZodString;
    /**
     * Section of the list this value belongs to, or null for a flat list.
     * Education groups by degree family, occupation by industry, and sub-caste
     * by the religion it applies to — which is why the picker filters sub-castes
     * by the member's own religion rather than offering all 835 of them.
     */
    group: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    value: string;
    id: string;
    group: string | null;
}, {
    value: string;
    id: string;
    group: string | null;
}>;
export type MasterListValue = z.infer<typeof MasterListValueSchema>;
export declare const MasterListSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    is_sensitive: z.ZodBoolean;
    values: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        value: z.ZodString;
        /**
         * Section of the list this value belongs to, or null for a flat list.
         * Education groups by degree family, occupation by industry, and sub-caste
         * by the religion it applies to — which is why the picker filters sub-castes
         * by the member's own religion rather than offering all 835 of them.
         */
        group: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        value: string;
        id: string;
        group: string | null;
    }, {
        value: string;
        id: string;
        group: string | null;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    values: {
        value: string;
        id: string;
        group: string | null;
    }[];
    key: string;
    label: string;
    is_sensitive: boolean;
}, {
    values: {
        value: string;
        id: string;
        group: string | null;
    }[];
    key: string;
    label: string;
    is_sensitive: boolean;
}>;
export type MasterList = z.infer<typeof MasterListSchema>;
export declare const MasterListsResponseSchema: z.ZodObject<{
    lists: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        is_sensitive: z.ZodBoolean;
        values: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            value: z.ZodString;
            /**
             * Section of the list this value belongs to, or null for a flat list.
             * Education groups by degree family, occupation by industry, and sub-caste
             * by the religion it applies to — which is why the picker filters sub-castes
             * by the member's own religion rather than offering all 835 of them.
             */
            group: z.ZodNullable<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            value: string;
            id: string;
            group: string | null;
        }, {
            value: string;
            id: string;
            group: string | null;
        }>, "many">;
    }, "strict", z.ZodTypeAny, {
        values: {
            value: string;
            id: string;
            group: string | null;
        }[];
        key: string;
        label: string;
        is_sensitive: boolean;
    }, {
        values: {
            value: string;
            id: string;
            group: string | null;
        }[];
        key: string;
        label: string;
        is_sensitive: boolean;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    lists: {
        values: {
            value: string;
            id: string;
            group: string | null;
        }[];
        key: string;
        label: string;
        is_sensitive: boolean;
    }[];
}, {
    lists: {
        values: {
            value: string;
            id: string;
            group: string | null;
        }[];
        key: string;
        label: string;
        is_sensitive: boolean;
    }[];
}>;
export type MasterListsResponse = z.infer<typeof MasterListsResponseSchema>;
/** Master-list keys, seeded and referenced by the profile schema. */
export declare const MASTER_LIST_KEYS: readonly ["RELIGION", "MOTHER_TONGUE", "EDUCATION", "PROFESSION", "CASTE", "COMMUNITY", "STATE"];
export type MasterListKey = (typeof MASTER_LIST_KEYS)[number];
/** The same keys as a schema, for validating a list key that arrives in a path. */
export declare const MasterListKeySchema: z.ZodEnum<["RELIGION", "MOTHER_TONGUE", "EDUCATION", "PROFESSION", "CASTE", "COMMUNITY", "STATE"]>;
/**
 * Map a profile field to the list it draws from, so the server can validate ids
 * without a per-field switch at every call site.
 */
export declare const PROFILE_MASTER_LIST_FIELDS: {
    readonly education_id: "EDUCATION";
    readonly profession_id: "PROFESSION";
    readonly community_id: "COMMUNITY";
};
//# sourceMappingURL=master-data.d.ts.map