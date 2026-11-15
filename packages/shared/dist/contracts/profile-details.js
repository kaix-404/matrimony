"use strict";
/**
 * The extra Edit Profile data points from the client's feedback (point 4).
 *
 * These are option sets, not extra schemas: the client's instruction was "use
 * Datapoints as it is", meaning the lists are fixed and only the presentation is
 * ours. They live in `shared` so the API validates against exactly the values the
 * app offers, and so a label cannot drift between the two.
 *
 * Stored as strings rather than database enums on purpose — a member of the
 * family list the client may add later must not require a migration, and these
 * are labels rather than ids because nothing joins on them.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileDetailListSchema = exports.COUNTRY_OPTIONS = exports.ANNUAL_INCOME_BANDS = exports.EMPLOYED_IN = exports.DRINKING_HABITS = exports.SMOKING_HABITS = exports.EATING_HABITS = exports.FOOD_OPTIONS = exports.SPORTS_OPTIONS = exports.MUSIC_OPTIONS = exports.HOBBY_OPTIONS = exports.FAMILY_STATUSES = exports.FAMILY_TYPES = exports.FAMILY_VALUES = exports.KUJA_DOSHAM_VALUES = exports.PHYSICAL_STATUSES = void 0;
const zod_1 = require("zod");
/** "Physically Challenged" is the client's wording; keep it verbatim. */
exports.PHYSICAL_STATUSES = ['NORMAL', 'PHYSICALLY_CHALLENGED'];
/**
 * Kuja Dosham, as the client asks it: yes, no, or don't know.
 *
 * Stored in the existing `manglik_status` column — it is the same question under
 * its North Indian name, and the field already existed as free text — but the
 * options are fixed here so a profile cannot end up with "Maybe" in it.
 */
exports.KUJA_DOSHAM_VALUES = ['YES', 'NO', 'DONT_KNOW'];
exports.FAMILY_VALUES = ['ORTHODOX', 'TRADITIONAL', 'MODERATE', 'LIBERAL'];
exports.FAMILY_TYPES = ['JOINT', 'NUCLEAR'];
exports.FAMILY_STATUSES = ['MIDDLE_CLASS', 'UPPER_MIDDLE_CLASS', 'RICH_AFFLUENT'];
/** Client's hobbies list, in their order. */
exports.HOBBY_OPTIONS = [
    'Art / Handicraft',
    'Cooking',
    'Dancing',
    'Gardening',
    'Nature',
    'Painting',
    'Pets',
    'Photography',
    'Playing musical instrument',
    'Puzzles',
    'Internet Surfing',
    'Listening to Music',
    'Movies',
    'Travelling',
];
exports.MUSIC_OPTIONS = ['Film songs', 'Indian Classical', 'Western'];
exports.SPORTS_OPTIONS = [
    'Badminton',
    'Carrom',
    'Chess',
    'Cricket',
    'Football',
    'Jogging',
    'Swimming',
];
exports.FOOD_OPTIONS = [
    'Arabic',
    'Bengali',
    'Chinese',
    'Continental',
    'Fast food',
    'Gujarati',
    'Italian',
    'Konkan',
    'Mexican',
    'Mughlai',
    'Marathi',
    'Punjabi',
    'South Indian',
    'Spanish',
    'Sushi',
    'Rajasthani',
];
/**
 * The client's habit questions, worded as their reference radio groups have
 * them. Stored as these labels rather than enum keys: the profile column was
 * free text before this list existed, so a label keeps older rows readable next
 * to new ones instead of stranding them as unset.
 */
exports.EATING_HABITS = ['Vegetarian', 'Non-vegetarian', 'Eggetarian', 'Vegan'];
/** Client's four smoking answers (their reference: Non-smoker / Light / Social / Regular). */
exports.SMOKING_HABITS = [
    'Non-smoker',
    'Light smoker',
    'Social smoker',
    'Regular smoker',
];
exports.DRINKING_HABITS = [
    'Non-drinker',
    'Light drinker',
    'Social drinker',
    'Regular drinker',
];
/** "Employed In" from the client's partner-preference reference. */
exports.EMPLOYED_IN = ['Government', 'Private', 'Business', 'Self-employed', 'Not working'];
/**
 * Annual income, in bands.
 *
 * Bands rather than a number because members answer this in lakhs and the
 * profile never held anything more precise; a band is also what a partner
 * preference sensibly matches on.
 */
exports.ANNUAL_INCOME_BANDS = [
    'Below ₹5 lakh',
    '₹5-10 lakh',
    '₹10-20 lakh',
    '₹20-35 lakh',
    '₹35-50 lakh',
    'Above ₹50 lakh',
];
/**
 * The country picker.
 *
 * The profile column is `VarChar(2)` ISO code and there is no COUNTRY master
 * list, so the app carries the shortlist it offers. Codes, because that is what
 * both the profile and the preference column can store.
 */
exports.COUNTRY_OPTIONS = [
    { code: 'IN', label: 'India' },
    { code: 'US', label: 'United States' },
    { code: 'GB', label: 'United Kingdom' },
    { code: 'CA', label: 'Canada' },
    { code: 'AU', label: 'Australia' },
    { code: 'NZ', label: 'New Zealand' },
    { code: 'AE', label: 'United Arab Emirates' },
    { code: 'SG', label: 'Singapore' },
    { code: 'MY', label: 'Malaysia' },
    { code: 'DE', label: 'Germany' },
    { code: 'IE', label: 'Ireland' },
    { code: 'SA', label: 'Saudi Arabia' },
    { code: 'QA', label: 'Qatar' },
    { code: 'KW', label: 'Kuwait' },
    { code: 'OM', label: 'Oman' },
];
/**
 * One multi-select answer.
 *
 * Bounded like every other list in the contracts: a client that sends the whole
 * option set for four blocks should still not be able to write an unbounded row,
 * and the cap is above the longest list the client supplied plus room for the
 * "Others" box.
 */
exports.ProfileDetailListSchema = zod_1.z.array(zod_1.z.string().trim().min(1).max(60)).max(24);
//# sourceMappingURL=profile-details.js.map