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
import { z } from 'zod';
/** "Physically Challenged" is the client's wording; keep it verbatim. */
export declare const PHYSICAL_STATUSES: readonly ["NORMAL", "PHYSICALLY_CHALLENGED"];
/**
 * Kuja Dosham, as the client asks it: yes, no, or don't know.
 *
 * Stored in the existing `manglik_status` column — it is the same question under
 * its North Indian name, and the field already existed as free text — but the
 * options are fixed here so a profile cannot end up with "Maybe" in it.
 */
export declare const KUJA_DOSHAM_VALUES: readonly ["YES", "NO", "DONT_KNOW"];
export declare const FAMILY_VALUES: readonly ["ORTHODOX", "TRADITIONAL", "MODERATE", "LIBERAL"];
export declare const FAMILY_TYPES: readonly ["JOINT", "NUCLEAR"];
export declare const FAMILY_STATUSES: readonly ["MIDDLE_CLASS", "UPPER_MIDDLE_CLASS", "RICH_AFFLUENT"];
/** Client's hobbies list, in their order. */
export declare const HOBBY_OPTIONS: readonly ["Art / Handicraft", "Cooking", "Dancing", "Gardening", "Nature", "Painting", "Pets", "Photography", "Playing musical instrument", "Puzzles", "Internet Surfing", "Listening to Music", "Movies", "Travelling"];
export declare const MUSIC_OPTIONS: readonly ["Film songs", "Indian Classical", "Western"];
export declare const SPORTS_OPTIONS: readonly ["Badminton", "Carrom", "Chess", "Cricket", "Football", "Jogging", "Swimming"];
export declare const FOOD_OPTIONS: readonly ["Arabic", "Bengali", "Chinese", "Continental", "Fast food", "Gujarati", "Italian", "Konkan", "Mexican", "Mughlai", "Marathi", "Punjabi", "South Indian", "Spanish", "Sushi", "Rajasthani"];
/**
 * The client's habit questions, worded as their reference radio groups have
 * them. Stored as these labels rather than enum keys: the profile column was
 * free text before this list existed, so a label keeps older rows readable next
 * to new ones instead of stranding them as unset.
 */
export declare const EATING_HABITS: readonly ["Vegetarian", "Non-vegetarian", "Eggetarian", "Vegan"];
/** Client's four smoking answers (their reference: Non-smoker / Light / Social / Regular). */
export declare const SMOKING_HABITS: readonly ["Non-smoker", "Light smoker", "Social smoker", "Regular smoker"];
export declare const DRINKING_HABITS: readonly ["Non-drinker", "Light drinker", "Social drinker", "Regular drinker"];
/** "Employed In" from the client's partner-preference reference. */
export declare const EMPLOYED_IN: readonly ["Government", "Private", "Business", "Self-employed", "Not working"];
/**
 * Annual income, in bands.
 *
 * Bands rather than a number because members answer this in lakhs and the
 * profile never held anything more precise; a band is also what a partner
 * preference sensibly matches on.
 */
export declare const ANNUAL_INCOME_BANDS: readonly ["Below ₹5 lakh", "₹5-10 lakh", "₹10-20 lakh", "₹20-35 lakh", "₹35-50 lakh", "Above ₹50 lakh"];
/**
 * The country picker.
 *
 * The profile column is `VarChar(2)` ISO code and there is no COUNTRY master
 * list, so the app carries the shortlist it offers. Codes, because that is what
 * both the profile and the preference column can store.
 */
export declare const COUNTRY_OPTIONS: readonly [{
    readonly code: "IN";
    readonly label: "India";
}, {
    readonly code: "US";
    readonly label: "United States";
}, {
    readonly code: "GB";
    readonly label: "United Kingdom";
}, {
    readonly code: "CA";
    readonly label: "Canada";
}, {
    readonly code: "AU";
    readonly label: "Australia";
}, {
    readonly code: "NZ";
    readonly label: "New Zealand";
}, {
    readonly code: "AE";
    readonly label: "United Arab Emirates";
}, {
    readonly code: "SG";
    readonly label: "Singapore";
}, {
    readonly code: "MY";
    readonly label: "Malaysia";
}, {
    readonly code: "DE";
    readonly label: "Germany";
}, {
    readonly code: "IE";
    readonly label: "Ireland";
}, {
    readonly code: "SA";
    readonly label: "Saudi Arabia";
}, {
    readonly code: "QA";
    readonly label: "Qatar";
}, {
    readonly code: "KW";
    readonly label: "Kuwait";
}, {
    readonly code: "OM";
    readonly label: "Oman";
}];
/**
 * One multi-select answer.
 *
 * Bounded like every other list in the contracts: a client that sends the whole
 * option set for four blocks should still not be able to write an unbounded row,
 * and the cap is above the longest list the client supplied plus room for the
 * "Others" box.
 */
export declare const ProfileDetailListSchema: z.ZodArray<z.ZodString, "many">;
export type PhysicalStatus = (typeof PHYSICAL_STATUSES)[number];
export type KujaDosham = (typeof KUJA_DOSHAM_VALUES)[number];
export type FamilyValue = (typeof FAMILY_VALUES)[number];
export type FamilyType = (typeof FAMILY_TYPES)[number];
export type FamilyStatus = (typeof FAMILY_STATUSES)[number];
//# sourceMappingURL=profile-details.d.ts.map