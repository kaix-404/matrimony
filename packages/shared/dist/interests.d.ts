/**
 * The curated interest vocabulary (AI recommendations, client answer 1:
 * curated list, no free text).
 *
 * Shared so the seed, the API and any first-party client agree on the same keys
 * without a release drifting them apart. The database `Interest` table is the
 * runtime authority — this list is what the seed writes and what tests assert
 * against, exactly as `ADMIN_PERMISSIONS` is for RBAC.
 */
export interface InterestCatalogueEntry {
    key: string;
    label: string;
    /** Display order in the picker. Gaps are fine; order is all that matters. */
    sortOrder: number;
}
/**
 * Lifestyle tags, deliberately generic so they apply across communities and
 * regions. Not a personality test and not the net-worth bands — those stay
 * server-controlled (B1).
 */
export declare const DEFAULT_INTERESTS: readonly InterestCatalogueEntry[];
/** The maximum number of interests a profile may select. */
export declare const MAX_PROFILE_INTERESTS = 30;
export declare const INTEREST_KEYS: readonly string[];
//# sourceMappingURL=interests.d.ts.map