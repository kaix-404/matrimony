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
export const PHYSICAL_STATUSES = ['NORMAL', 'PHYSICALLY_CHALLENGED'] as const;

/**
 * Kuja Dosham, as the client asks it: yes, no, or don't know.
 *
 * Stored in the existing `manglik_status` column — it is the same question under
 * its North Indian name, and the field already existed as free text — but the
 * options are fixed here so a profile cannot end up with "Maybe" in it.
 */
export const KUJA_DOSHAM_VALUES = ['YES', 'NO', 'DONT_KNOW'] as const;

export const FAMILY_VALUES = ['ORTHODOX', 'TRADITIONAL', 'MODERATE', 'LIBERAL'] as const;
export const FAMILY_TYPES = ['JOINT', 'NUCLEAR'] as const;
export const FAMILY_STATUSES = ['MIDDLE_CLASS', 'UPPER_MIDDLE_CLASS', 'RICH_AFFLUENT'] as const;

/** Client's hobbies list, in their order. */
export const HOBBY_OPTIONS = [
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
] as const;

export const MUSIC_OPTIONS = ['Film songs', 'Indian Classical', 'Western'] as const;

export const SPORTS_OPTIONS = [
  'Badminton',
  'Carrom',
  'Chess',
  'Cricket',
  'Football',
  'Jogging',
  'Swimming',
] as const;

export const FOOD_OPTIONS = [
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
] as const;

/**
 * The client's habit questions, worded as their reference radio groups have
 * them. Stored as these labels rather than enum keys: the profile column was
 * free text before this list existed, so a label keeps older rows readable next
 * to new ones instead of stranding them as unset.
 */
export const EATING_HABITS = ['Vegetarian', 'Non-vegetarian', 'Eggetarian', 'Vegan'] as const;

/** Client's four smoking answers (their reference: Non-smoker / Light / Social / Regular). */
export const SMOKING_HABITS = [
  'Non-smoker',
  'Light smoker',
  'Social smoker',
  'Regular smoker',
] as const;

export const DRINKING_HABITS = [
  'Non-drinker',
  'Light drinker',
  'Social drinker',
  'Regular drinker',
] as const;

/** "Employed In" from the client's partner-preference reference. */
export const EMPLOYED_IN = ['Government', 'Private', 'Business', 'Self-employed', 'Not working'] as const;

/**
 * Annual income, in bands.
 *
 * Bands rather than a number because members answer this in lakhs and the
 * profile never held anything more precise; a band is also what a partner
 * preference sensibly matches on.
 */
export const ANNUAL_INCOME_BANDS = [
  'Below ₹5 lakh',
  '₹5-10 lakh',
  '₹10-20 lakh',
  '₹20-35 lakh',
  '₹35-50 lakh',
  'Above ₹50 lakh',
] as const;

/**
 * The country picker.
 *
 * The profile column is `VarChar(2)` ISO code and there is no COUNTRY master
 * list, so the app carries the shortlist it offers. Codes, because that is what
 * both the profile and the preference column can store.
 */
export const COUNTRY_OPTIONS = [
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
] as const;

/**
 * One multi-select answer.
 *
 * Bounded like every other list in the contracts: a client that sends the whole
 * option set for four blocks should still not be able to write an unbounded row,
 * and the cap is above the longest list the client supplied plus room for the
 * "Others" box.
 */
export const ProfileDetailListSchema = z.array(z.string().trim().min(1).max(60)).max(24);

export type PhysicalStatus = (typeof PHYSICAL_STATUSES)[number];
export type KujaDosham = (typeof KUJA_DOSHAM_VALUES)[number];
export type FamilyValue = (typeof FAMILY_VALUES)[number];
export type FamilyType = (typeof FAMILY_TYPES)[number];
export type FamilyStatus = (typeof FAMILY_STATUSES)[number];
