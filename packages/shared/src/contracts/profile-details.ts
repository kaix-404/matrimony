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
