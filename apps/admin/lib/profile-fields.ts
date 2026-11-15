import {
  DRINKING_HABITS,
  EATING_HABITS,
  EMPLOYED_IN,
  FAMILY_STATUSES,
  FAMILY_TYPES,
  FAMILY_VALUES,
  KUJA_DOSHAM_VALUES,
  MARITAL_STATUSES,
  PHYSICAL_STATUSES,
  SMOKING_HABITS,
  type AdminProfileDetail,
} from '@matrimony/shared';

export interface SelectChoice {
  value: string;
  label: string;
}

/** How an editable field is rendered, and therefore how it is parsed back. */
export type EditFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'list';

export interface EditFieldSpec {
  /** The `AdminProfileUpdateSchema` key, which is also the profile contract's. */
  key: string;
  label: string;
  type: EditFieldType;
  options?: readonly SelectChoice[];
  maxLength?: number;
  hint?: string;
}

const choices = (values: readonly string[], labels: Record<string, string> = {}): SelectChoice[] =>
  values.map((value) => ({ value, label: labels[value] ?? value }));

const MARITAL_LABELS: Record<string, string> = {
  NEVER_MARRIED: 'Never married',
  DIVORCED: 'Divorced',
  WIDOWED: 'Widowed',
  AWAITING_DIVORCE: 'Awaiting divorce',
  ANNULLED: 'Annulled',
};

const PHYSICAL_LABELS: Record<string, string> = {
  NORMAL: 'Normal',
  PHYSICALLY_CHALLENGED: 'Physically challenged',
};

const KUJA_LABELS: Record<string, string> = {
  YES: 'Yes',
  NO: 'No',
  DONT_KNOW: "Don't know",
};

const FAMILY_VALUE_LABELS: Record<string, string> = {
  ORTHODOX: 'Orthodox',
  TRADITIONAL: 'Traditional',
  MODERATE: 'Moderate',
  LIBERAL: 'Liberal',
};

const FAMILY_TYPE_LABELS: Record<string, string> = { JOINT: 'Joint family', NUCLEAR: 'Nuclear family' };

const FAMILY_STATUS_LABELS: Record<string, string> = {
  MIDDLE_CLASS: 'Middle class',
  UPPER_MIDDLE_CLASS: 'Upper middle class',
  RICH_AFFLUENT: 'Rich / Affluent',
};

/**
 * The fields the console can correct, in the order it shows them.
 *
 * Deliberately narrower than the profile: gender, the master-list-backed columns
 * (education, profession, community) and photographs are not support corrections
 * and have their own flows, so an administrator cannot rewrite them from here.
 */
export const PROFILE_EDIT_SECTIONS: ReadonlyArray<{ title: string; fields: EditFieldSpec[] }> = [
  {
    title: 'Basics',
    fields: [
      { key: 'first_name', label: 'First name', type: 'text', maxLength: 80 },
      { key: 'last_name', label: 'Last name', type: 'text', maxLength: 80 },
      { key: 'date_of_birth', label: 'Date of birth', type: 'date' },
      { key: 'height_cm', label: 'Height (cm)', type: 'number' },
      { key: 'weight_kg', label: 'Weight (kg)', type: 'number' },
      {
        key: 'marital_status',
        label: 'Marital status',
        type: 'select',
        options: choices(MARITAL_STATUSES, MARITAL_LABELS),
      },
      {
        key: 'physical_status',
        label: 'Physical status',
        type: 'select',
        options: choices(PHYSICAL_STATUSES, PHYSICAL_LABELS),
      },
    ],
  },
  {
    title: 'Community and beliefs',
    fields: [
      { key: 'religion', label: 'Religion', type: 'text', maxLength: 80 },
      { key: 'sub_caste', label: 'Sub-caste', type: 'text', maxLength: 80 },
      { key: 'mother_tongue', label: 'Mother tongue', type: 'text', maxLength: 60 },
      {
        key: 'languages_known',
        label: 'Languages known',
        type: 'list',
        hint: 'Comma separated.',
      },
      { key: 'swagotra', label: 'Gothra', type: 'text', maxLength: 60 },
      { key: 'maternal_gothra', label: "Mother's gothra", type: 'text', maxLength: 60 },
      { key: 'rashi', label: 'Raasi', type: 'text', maxLength: 40 },
      { key: 'nakshatra', label: 'Star', type: 'text', maxLength: 40 },
      { key: 'gan', label: 'Gan', type: 'text', maxLength: 60 },
      {
        key: 'manglik_status',
        label: 'Kuja dosham',
        type: 'select',
        options: choices(KUJA_DOSHAM_VALUES, KUJA_LABELS),
      },
    ],
  },
  {
    title: 'Career',
    fields: [
      {
        key: 'employed_in',
        label: 'Employed in',
        type: 'select',
        options: choices(EMPLOYED_IN),
      },
      { key: 'company', label: 'Company', type: 'text', maxLength: 120 },
      { key: 'annual_income', label: 'Annual income', type: 'text', maxLength: 60 },
      { key: 'work_location', label: 'Work location', type: 'text', maxLength: 120 },
    ],
  },
  {
    title: 'Family',
    fields: [
      { key: 'fathers_occupation', label: "Father's occupation", type: 'text', maxLength: 120 },
      { key: 'mothers_occupation', label: "Mother's occupation", type: 'text', maxLength: 120 },
      { key: 'siblings', label: 'Siblings', type: 'text', maxLength: 120 },
      { key: 'family_location', label: 'Family location', type: 'text', maxLength: 120 },
      {
        key: 'family_value',
        label: 'Family value',
        type: 'select',
        options: choices(FAMILY_VALUES, FAMILY_VALUE_LABELS),
      },
      {
        key: 'family_type',
        label: 'Family type',
        type: 'select',
        options: choices(FAMILY_TYPES, FAMILY_TYPE_LABELS),
      },
      {
        key: 'family_status',
        label: 'Family status',
        type: 'select',
        options: choices(FAMILY_STATUSES, FAMILY_STATUS_LABELS),
      },
      { key: 'native_place', label: 'Native place', type: 'text', maxLength: 120 },
      { key: 'brothers_count', label: 'No. of brothers', type: 'number' },
      { key: 'brothers_married_count', label: 'Brothers married', type: 'number' },
      { key: 'sisters_count', label: 'No. of sisters', type: 'number' },
      { key: 'sisters_married_count', label: 'Sisters married', type: 'number' },
      {
        key: 'family_description',
        label: 'About my family',
        type: 'textarea',
        maxLength: 2000,
      },
    ],
  },
  {
    title: 'Lifestyle',
    fields: [
      {
        key: 'food_preference',
        label: 'Eating habits',
        type: 'select',
        options: choices(EATING_HABITS),
      },
      { key: 'smoking', label: 'Smoking habits', type: 'select', options: choices(SMOKING_HABITS) },
      {
        key: 'drinking',
        label: 'Drinking habits',
        type: 'select',
        options: choices(DRINKING_HABITS),
      },
      {
        key: 'about_me',
        label: 'About me',
        type: 'textarea',
        maxLength: 2000,
        hint: 'At least 50 characters, as the member form requires.',
      },
    ],
  },
  {
    title: 'Interests',
    fields: [
      { key: 'hobbies', label: 'Hobbies', type: 'list', hint: 'Comma separated.' },
      { key: 'favourite_music', label: 'Favourite music', type: 'list', hint: 'Comma separated.' },
      { key: 'sports', label: 'Sports', type: 'list', hint: 'Comma separated.' },
      { key: 'favourite_food', label: 'Favourite food', type: 'list', hint: 'Comma separated.' },
    ],
  },
  {
    title: 'Location',
    fields: [
      {
        key: 'country',
        label: 'Country code',
        type: 'text',
        maxLength: 2,
        hint: 'Two-letter ISO code, e.g. IN.',
      },
      { key: 'state', label: 'State', type: 'text', maxLength: 80 },
      { key: 'city', label: 'City', type: 'text', maxLength: 80 },
    ],
  },
];

/** The read-only rows above the edit form: everything the profile holds. */
export const PROFILE_READ_ROWS: ReadonlyArray<{ label: string; key: keyof AdminProfileDetail }> = [
  { label: 'Profile id', key: 'id' },
  { label: 'Moderation status', key: 'status' },
  { label: 'Visibility', key: 'visibility' },
  { label: 'Name', key: 'first_name' },
  { label: 'Last name', key: 'last_name' },
  { label: 'Gender', key: 'gender' },
  { label: 'Date of birth', key: 'date_of_birth' },
  { label: 'Time of birth', key: 'time_of_birth' },
  { label: 'Place of birth', key: 'place_of_birth' },
  { label: 'Height (cm)', key: 'height_cm' },
  { label: 'Weight (kg)', key: 'weight_kg' },
  { label: 'Marital status', key: 'marital_status' },
  { label: 'Physical status', key: 'physical_status' },
  { label: 'Religion', key: 'religion' },
  { label: 'Sub-caste', key: 'sub_caste' },
  { label: 'Community', key: 'community' },
  { label: 'Mother tongue', key: 'mother_tongue' },
  { label: 'Languages known', key: 'languages_known' },
  { label: 'Gothra', key: 'swagotra' },
  { label: "Mother's gothra", key: 'maternal_gothra' },
  { label: 'Raasi', key: 'rashi' },
  { label: 'Star', key: 'nakshatra' },
  { label: 'Gan', key: 'gan' },
  { label: 'Kuja dosham', key: 'manglik_status' },
  { label: 'Education', key: 'education' },
  { label: 'Profession', key: 'profession' },
  { label: 'Employed in', key: 'employed_in' },
  { label: 'Company', key: 'company' },
  { label: 'Annual income', key: 'annual_income' },
  { label: 'Work location', key: 'work_location' },
  { label: "Father's occupation", key: 'fathers_occupation' },
  { label: "Mother's occupation", key: 'mothers_occupation' },
  { label: 'Siblings', key: 'siblings' },
  { label: 'Family location', key: 'family_location' },
  { label: 'Family description', key: 'family_description' },
  { label: 'Family value', key: 'family_value' },
  { label: 'Family type', key: 'family_type' },
  { label: 'Family status', key: 'family_status' },
  { label: 'Native place', key: 'native_place' },
  { label: 'Brothers', key: 'brothers_count' },
  { label: 'Brothers married', key: 'brothers_married_count' },
  { label: 'Sisters', key: 'sisters_count' },
  { label: 'Sisters married', key: 'sisters_married_count' },
  { label: 'Eating habits', key: 'food_preference' },
  { label: 'Smoking', key: 'smoking' },
  { label: 'Drinking', key: 'drinking' },
  { label: 'About me', key: 'about_me' },
  { label: 'Hobbies', key: 'hobbies' },
  { label: 'Favourite music', key: 'favourite_music' },
  { label: 'Sports', key: 'sports' },
  { label: 'Favourite food', key: 'favourite_food' },
  { label: 'Country', key: 'country' },
  { label: 'State', key: 'state' },
  { label: 'City', key: 'city' },
  { label: 'Created', key: 'submitted_at' },
  { label: 'Approved', key: 'approved_at' },
  { label: 'Rejected', key: 'rejected_at' },
  { label: 'Rejection reason', key: 'rejection_reason' },
  { label: 'Last updated', key: 'updated_at' },
];

/** How a stored value reads in the detail list. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.join(', ');
  return String(value);
}
