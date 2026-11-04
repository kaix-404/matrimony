"use strict";
/**
 * The curated interest vocabulary (AI recommendations, client answer 1:
 * curated list, no free text).
 *
 * Shared so the seed, the API and any first-party client agree on the same keys
 * without a release drifting them apart. The database `Interest` table is the
 * runtime authority — this list is what the seed writes and what tests assert
 * against, exactly as `ADMIN_PERMISSIONS` is for RBAC.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTEREST_KEYS = exports.MAX_PROFILE_INTERESTS = exports.DEFAULT_INTERESTS = void 0;
/**
 * Lifestyle tags, deliberately generic so they apply across communities and
 * regions. Not a personality test and not the net-worth bands — those stay
 * server-controlled (B1).
 */
exports.DEFAULT_INTERESTS = [
    { key: 'TRAVEL', label: 'Travel', sortOrder: 10 },
    { key: 'MOVIES', label: 'Movies', sortOrder: 20 },
    { key: 'MUSIC', label: 'Music', sortOrder: 30 },
    { key: 'READING', label: 'Reading', sortOrder: 40 },
    { key: 'FITNESS', label: 'Fitness', sortOrder: 50 },
    { key: 'FOOD', label: 'Food', sortOrder: 60 },
    { key: 'PHOTOGRAPHY', label: 'Photography', sortOrder: 70 },
    { key: 'ART', label: 'Art', sortOrder: 80 },
    { key: 'GAMING', label: 'Gaming', sortOrder: 90 },
    { key: 'SPORTS', label: 'Sports', sortOrder: 100 },
    { key: 'YOGA', label: 'Yoga', sortOrder: 110 },
    { key: 'COOKING', label: 'Cooking', sortOrder: 120 },
    { key: 'TECHNOLOGY', label: 'Technology', sortOrder: 130 },
    { key: 'BUSINESS', label: 'Business', sortOrder: 140 },
    { key: 'VOLUNTEERING', label: 'Volunteering', sortOrder: 150 },
    { key: 'PETS', label: 'Pets', sortOrder: 160 },
];
/** The maximum number of interests a profile may select. */
exports.MAX_PROFILE_INTERESTS = 30;
exports.INTEREST_KEYS = exports.DEFAULT_INTERESTS.map((i) => i.key);
//# sourceMappingURL=interests.js.map