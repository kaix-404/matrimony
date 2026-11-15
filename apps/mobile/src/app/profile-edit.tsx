import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  DRINKING_HABITS,
  EATING_HABITS,
  EMPLOYED_IN,
  FAMILY_STATUSES,
  FAMILY_TYPES,
  FAMILY_VALUES,
  GENDERS,
  FOOD_OPTIONS,
  HOBBY_OPTIONS,
  KUJA_DOSHAM_VALUES,
  MARITAL_STATUSES,
  MUSIC_OPTIONS,
  PHYSICAL_STATUSES,
  SMOKING_HABITS,
  SPORTS_OPTIONS,
  type MasterList,
  type MasterListsResponse,
  type MyProfile,
  type UpdateProfileInput,
} from '@matrimony/shared';
import { CheckboxField } from '../components/CheckboxField';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import {
  idOptions,
  listFor,
  subCasteOptions,
  textOptions,
  withCurrent,
} from '../lib/master-list-options';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, spacing, typography } from '../theme/tokens';

const GENDER_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
};

const MARITAL_LABELS: Record<string, string> = {
  NEVER_MARRIED: 'Never married',
  DIVORCED: 'Divorced',
  WIDOWED: 'Widowed',
  AWAITING_DIVORCE: 'Awaiting divorce',
};

/** The client's option sets, stored as keys and shown as the words in their PDF. */
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

const FAMILY_TYPE_LABELS: Record<string, string> = {
  JOINT: 'Joint family',
  NUCLEAR: 'Nuclear family',
};

const FAMILY_STATUS_LABELS: Record<string, string> = {
  MIDDLE_CLASS: 'Middle class',
  UPPER_MIDDLE_CLASS: 'Upper middle class',
  RICH_AFFLUENT: 'Rich / Affluent',
};

/** Every free-text field the owner may edit, and how it maps to the API. */
interface TextSpec {
  key: string;
  api: string;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  kind?: 'int' | 'country';
}

const TEXT_FIELDS: TextSpec[] = [
  { key: 'swagotra', api: 'swagotra', maxLength: 60 },
  { key: 'maternalGothra', api: 'maternal_gothra', maxLength: 60 },
  { key: 'rashi', api: 'rashi', maxLength: 40 },
  { key: 'nakshatra', api: 'nakshatra', maxLength: 40 },
  { key: 'company', api: 'company', maxLength: 120 },
  { key: 'annualIncome', api: 'annual_income', maxLength: 60 },
  { key: 'workLocation', api: 'work_location', maxLength: 120 },
  { key: 'fathersOccupation', api: 'fathers_occupation', maxLength: 120 },
  { key: 'mothersOccupation', api: 'mothers_occupation', maxLength: 120 },
  { key: 'siblings', api: 'siblings', maxLength: 120 },
  { key: 'familyLocation', api: 'family_location', maxLength: 120 },
  { key: 'foodPreference', api: 'food_preference', maxLength: 60 },
  { key: 'smoking', api: 'smoking', maxLength: 60 },
  { key: 'drinking', api: 'drinking', maxLength: 60 },
  { key: 'city', api: 'city', maxLength: 80 },
  { key: 'country', api: 'country', maxLength: 2, kind: 'country' },
];

/**
 * Edits the caller's own profile with PATCH semantics.
 *
 * Only fields the user actually changed are sent, because the API reads an
 * absent field as "leave it alone" and an explicit `null` as "clear it". A form
 * that posted every field would clear anything the user had not scrolled to, so
 * the initial values are kept and diffed against on save.
 */
export default function ProfileEditScreen() {
  const { ready } = useRequireAuth();
  const { token, refreshUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [lists, setLists] = useState<MasterListsResponse['lists']>([]);
  const [initial, setInitial] = useState<Record<string, string> | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  /**
   * The multi-select answers, held apart from `form` because a chip group edits a
   * set, not a string. Both halves are diffed against a pristine copy on save.
   */
  const [multi, setMulti] = useState<Record<string, string[]>>({});
  const [initialMulti, setInitialMulti] = useState<Record<string, string[]> | null>(null);
  /** The free-text "Others" box under each checkbox block, comma separated. */
  const [others, setOthers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const [mine, master] = await Promise.all([
        apiClient.getMyProfile(token),
        apiClient.getMasterLists(),
      ]);
      const snapshot = toForm(mine, master.lists);
      const listsSnapshot = toLists(mine);
      setProfile(mine);
      setLists(master.lists);
      setInitial(snapshot);
      setForm(snapshot);
      setInitialMulti(listsSnapshot);
      setMulti(listsSnapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your profile.');
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [ready, load]),
  );

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Changing religion drops a sub-caste that does not belong to the new one.
   * The sub-caste lists are religion-scoped, so keeping a value across a change
   * would either hide it from the picker or store a caste under the wrong faith.
   */
  function changeReligion(next: string) {
    setForm((prev) => ({
      ...prev,
      religion: next,
      subCaste: subCasteOptions(caste, next).some((option) => option.value === prev.subCaste)
        ? (prev.subCaste ?? '')
        : '',
    }));
  }

  const dobValid = /^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth ?? '');
  const nameValid = (form.firstName ?? '').trim().length > 0;
  const changes = buildPatch(form, initial, multi, initialMulti, others);
  const aboutMe = (form.aboutMe ?? '').trim();
  const aboutMeError =
    aboutMe.length > 0 && aboutMe.length < 50 ? 'At least 50 characters' : null;

  async function save() {
    if (!token || !changes) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiClient.updateProfile(changes, token);
      const snapshot = toForm(updated, lists);
      const listsSnapshot = toLists(updated);
      setProfile(updated);
      setInitial(snapshot);
      setForm(snapshot);
      setInitialMulti(listsSnapshot);
      setMulti(listsSnapshot);
      setOthers({});
      await refreshUser();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!ready || loading || profile === null || initial === null) {
    return (
      <Screen title="Edit profile" back>
        <View style={styles.state}>
          {error !== null ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      </Screen>
    );
  }

  const community = listFor(lists, 'COMMUNITY');
  const education = listFor(lists, 'EDUCATION');
  const profession = listFor(lists, 'PROFESSION');
  const religionList = listFor(lists, 'RELIGION');
  const motherTongueList = listFor(lists, 'MOTHER_TONGUE');
  const caste = listFor(lists, 'CASTE');
  const stateList = listFor(lists, 'STATE');

  // Religion, sub-caste, mother tongue and state are stored as the label rather
  // than as a master-list id (religion is compared as text by the discovery
  // filters, and the sub-caste is scoped by it), so their options carry the
  // label as the value.
  const subCastes = subCasteOptions(caste, form.religion ?? '');

  return (
    <Screen
      title="Edit profile"
      subtitle="Your net-worth band is fixed at registration and shown read-only."
      back
      footer={
        <PrimaryButton
          label="Save changes"
          onPress={save}
          disabled={changes === null || !nameValid || !dobValid || aboutMeError !== null}
          loading={saving}
        />
      }
    >
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/biodata-import')}
        style={styles.importBanner}
      >
        <Text style={styles.importTitle}>Import from a biodata</Text>
        <Text style={styles.importBody}>
          Already have a biodata PDF? Upload it and we will fill the form for you.
        </Text>
      </Pressable>

      <Section title="Identity">
        <TextField
          label="First name"
          value={form.firstName ?? ''}
          onChangeText={(v) => set('firstName', v)}
          maxLength={80}
          autoCapitalize="words"
        />
        <TextField
          label="Last name"
          value={form.lastName ?? ''}
          onChangeText={(v) => set('lastName', v)}
          maxLength={80}
          autoCapitalize="words"
        />
        <TextField
          label="Date of birth"
          value={form.dateOfBirth ?? ''}
          onChangeText={(v) => set('dateOfBirth', v)}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          error={dobValid ? null : 'Use YYYY-MM-DD'}
        />
        <SelectField
          label="Gender"
          options={GENDERS.map((g) => ({ value: g, label: GENDER_LABELS[g] ?? g }))}
          value={form.gender || null}
          onChange={(v) => set('gender', v ?? '')}
          clearable={false}
        />
        <TextField
          label="Height (cm, optional)"
          value={form.heightCm ?? ''}
          onChangeText={(v) => set('heightCm', v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          maxLength={3}
        />
        <TextField
          label="Weight (kg, optional)"
          value={form.weightKg ?? ''}
          onChangeText={(v) => set('weightKg', v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          maxLength={3}
        />
        <SelectField
          label="Physical status"
          options={labelled(PHYSICAL_STATUSES, PHYSICAL_LABELS)}
          value={form.physicalStatus || null}
          onChange={(v) => set('physicalStatus', v ?? '')}
        />
        <SelectField
          label="Marital status"
          options={MARITAL_STATUSES.map((m) => ({ value: m, label: MARITAL_LABELS[m] ?? m }))}
          value={form.maritalStatus || null}
          onChange={(v) => set('maritalStatus', v ?? '')}
        />
      </Section>

      <Section title="Community and beliefs">
        {/* The client has not sent a community list yet, so the API serves none.
            A picker over an empty list opens on a sheet with no answers, so the
            question is asked only once there is something to choose from. */}
        {(community?.values.length ?? 0) > 0 ? (
          <SelectField
            label="Community"
            options={idOptions(community)}
            value={form.communityId || null}
            onChange={(v) => set('communityId', v ?? '')}
          />
        ) : null}
        <SelectField
          label="Religion"
          options={textOptions(religionList)}
          value={form.religion || null}
          onChange={(v) => changeReligion(v ?? '')}
        />
        <SelectField
          label="Sub-caste"
          options={subCastes}
          value={form.subCaste || null}
          onChange={(v) => set('subCaste', v ?? '')}
          placeholder={form.religion ? 'Not set' : 'Choose a religion first'}
        />
        <SelectField
          label="Mother tongue"
          options={textOptions(motherTongueList)}
          value={form.motherTongue || null}
          onChange={(v) => set('motherTongue', v ?? '')}
        />
        {TEXT_FIELDS.filter((s) =>
          ['swagotra', 'maternalGothra', 'rashi', 'nakshatra'].includes(s.key),
        ).map((spec) => (
          <TextField
            key={spec.key}
            label={labelFor(spec.api)}
            value={form[spec.key] ?? ''}
            onChangeText={(v) => set(spec.key, v)}
            maxLength={spec.maxLength}
          />
        ))}
        <CheckboxField
          label="Languages known"
          hint="Pick every language you can hold a conversation in."
          options={textOptions(motherTongueList).map((option) => option.value)}
          selected={multi.languagesKnown ?? []}
          onChange={(next) => setMulti((prev) => ({ ...prev, languagesKnown: next }))}
        />
        <SelectField
          label="Kuja dosham"
          options={labelled(KUJA_DOSHAM_VALUES, KUJA_LABELS)}
          value={form.manglikStatus || null}
          onChange={(v) => set('manglikStatus', v ?? '')}
        />
      </Section>

      <Section title="Education and work">
        <SelectField
          label="Education"
          options={idOptions(education)}
          value={form.educationId || null}
          onChange={(v) => set('educationId', v ?? '')}
        />
        <SelectField
          label="Occupation"
          options={idOptions(profession)}
          value={form.professionId || null}
          onChange={(v) => set('professionId', v ?? '')}
        />
        <SelectField
          label="Employed in"
          options={EMPLOYED_IN.map((value) => ({ value, label: value }))}
          value={form.employedIn || null}
          onChange={(v) => set('employedIn', v ?? '')}
        />
        {TEXT_FIELDS.filter((s) => ['company', 'annualIncome', 'workLocation'].includes(s.key)).map(
          (spec) => (
            <TextField
              key={spec.key}
              label={labelFor(spec.api)}
              value={form[spec.key] ?? ''}
              onChangeText={(v) => set(spec.key, v)}
              maxLength={spec.maxLength}
            />
          ),
        )}
      </Section>

      <Section title="Hobbies and interests">
        {/* Each block is the client's checkbox list plus their "Others" box: the
            list is closed, but members always have one answer it does not have. */}
        <CheckboxField
          label="Hobbies and interests"
          options={withExtras(HOBBY_OPTIONS, multi.hobbies ?? [])}
          selected={multi.hobbies ?? []}
          onChange={(next) => setMulti((prev) => ({ ...prev, hobbies: next }))}
        />
        <TextField
          label="Other hobbies (comma separated)"
          value={others.hobbies ?? ''}
          onChangeText={(v) => setOthers((prev) => ({ ...prev, hobbies: v }))}
          maxLength={160}
          autoCapitalize="words"
        />
        <CheckboxField
          label="Favourite music"
          options={withExtras(MUSIC_OPTIONS, multi.favouriteMusic ?? [])}
          selected={multi.favouriteMusic ?? []}
          onChange={(next) => setMulti((prev) => ({ ...prev, favouriteMusic: next }))}
        />
        <TextField
          label="Other music (comma separated)"
          value={others.favouriteMusic ?? ''}
          onChangeText={(v) => setOthers((prev) => ({ ...prev, favouriteMusic: v }))}
          maxLength={160}
          autoCapitalize="words"
        />
        <CheckboxField
          label="Sports you like"
          options={withExtras(SPORTS_OPTIONS, multi.sports ?? [])}
          selected={multi.sports ?? []}
          onChange={(next) => setMulti((prev) => ({ ...prev, sports: next }))}
        />
        <TextField
          label="Other sports (comma separated)"
          value={others.sports ?? ''}
          onChangeText={(v) => setOthers((prev) => ({ ...prev, sports: v }))}
          maxLength={160}
          autoCapitalize="words"
        />
        <CheckboxField
          label="Favourite food"
          options={withExtras(FOOD_OPTIONS, multi.favouriteFood ?? [])}
          selected={multi.favouriteFood ?? []}
          onChange={(next) => setMulti((prev) => ({ ...prev, favouriteFood: next }))}
        />
        <TextField
          label="Other food (comma separated)"
          value={others.favouriteFood ?? ''}
          onChangeText={(v) => setOthers((prev) => ({ ...prev, favouriteFood: v }))}
          maxLength={160}
          autoCapitalize="words"
        />
      </Section>

      <Section title="Family">
        {TEXT_FIELDS.filter((s) =>
          ['fathersOccupation', 'mothersOccupation', 'siblings', 'familyLocation'].includes(s.key),
        ).map((spec) => (
          <TextField
            key={spec.key}
            label={labelFor(spec.api)}
            value={form[spec.key] ?? ''}
            onChangeText={(v) => set(spec.key, v)}
            maxLength={spec.maxLength}
          />
        ))}
        <SelectField
          label="Family value"
          options={labelled(FAMILY_VALUES, FAMILY_VALUE_LABELS)}
          value={form.familyValue || null}
          onChange={(v) => set('familyValue', v ?? '')}
        />
        <SelectField
          label="Family type"
          options={labelled(FAMILY_TYPES, FAMILY_TYPE_LABELS)}
          value={form.familyType || null}
          onChange={(v) => set('familyType', v ?? '')}
        />
        <SelectField
          label="Family status"
          options={labelled(FAMILY_STATUSES, FAMILY_STATUS_LABELS)}
          value={form.familyStatus || null}
          onChange={(v) => set('familyStatus', v ?? '')}
        />
        <TextField
          label="Native place"
          value={form.nativePlace ?? ''}
          onChangeText={(v) => set('nativePlace', v)}
          maxLength={120}
          autoCapitalize="words"
        />
        {(
          [
            ['brothersCount', 'No. of brothers'],
            ['brothersMarriedCount', 'Brothers married'],
            ['sistersCount', 'No. of sisters'],
            ['sistersMarriedCount', 'Sisters married'],
          ] as const
        ).map(([key, label]) => (
          <TextField
            key={key}
            label={label}
            value={form[key] ?? ''}
            onChangeText={(v) => set(key, v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={2}
          />
        ))}
        <TextField
          label="About my family"
          value={form.familyDescription ?? ''}
          onChangeText={(v) => set('familyDescription', v)}
          multiline
          maxLength={2000}
        />
      </Section>

      <Section title="Lifestyle and about">
        {/* The client's habit questions are radio groups, so each is a picker over
            their own wording rather than a box the member types into. */}
        <SelectField
          label="Eating habits"
          options={EATING_HABITS.map((value) => ({ value, label: value }))}
          value={form.foodPreference || null}
          onChange={(v) => set('foodPreference', v ?? '')}
        />
        <SelectField
          label="Smoking habits"
          options={SMOKING_HABITS.map((value) => ({ value, label: value }))}
          value={form.smoking || null}
          onChange={(v) => set('smoking', v ?? '')}
        />
        <SelectField
          label="Drinking habits"
          options={DRINKING_HABITS.map((value) => ({ value, label: value }))}
          value={form.drinking || null}
          onChange={(v) => set('drinking', v ?? '')}
        />
        <TextField
          label="About me"
          value={form.aboutMe ?? ''}
          onChangeText={(v) => set('aboutMe', v)}
          multiline
          maxLength={2000}
          error={aboutMeError}
          // The client's reference shows the counter under the box.
          hint={`${(form.aboutMe ?? '').trim().length} characters (minimum 50)`}
        />
      </Section>

      <Section title="Location">
        <SelectField
          label="State"
          options={withCurrent(textOptions(stateList), form.state ?? '')}
          value={form.state || null}
          onChange={(v) => set('state', v ?? '')}
        />
        {TEXT_FIELDS.filter((s) => ['city', 'country'].includes(s.key)).map((spec) => (
          <TextField
            key={spec.key}
            label={labelFor(spec.api)}
            value={form[spec.key] ?? ''}
            onChangeText={(v) => set(spec.key, spec.kind === 'country' ? v.toUpperCase() : v)}
            maxLength={spec.maxLength}
            autoCapitalize={spec.kind === 'country' ? 'characters' : 'words'}
          />
        ))}
      </Section>
    </Screen>
  );
}

/** Turns stored keys into picker rows, showing the client's wording. */
function labelled(
  values: readonly string[],
  labels: Record<string, string>,
): { value: string; label: string }[] {
  return values.map((value) => ({ value, label: labels[value] ?? value }));
}

/**
 * A block's options plus whatever "Others" values the member already saved.
 *
 * A saved custom answer is not in the client's list, so without this it would
 * vanish from the screen on the next visit while still counting towards the
 * profile.
 */
function withExtras(base: readonly string[], selected: readonly string[]): string[] {
  return [...base, ...selected.filter((value) => !base.includes(value))];
}

/** The "Others" box as answers: comma or newline separated, blanks dropped. */
function extraValues(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 12);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** Matches a stored label back to a master-list value id, for pre-selection. */
function idForLabel(list: MasterList | undefined, label: string | null): string {
  if (!label) return '';
  return list?.values.find((value) => value.value === label)?.id ?? '';
}

/** Turns a MyProfile into the editable snapshot, resolving master-list ids. */
function toForm(profile: MyProfile, lists: MasterList[]): Record<string, string> {
  const base: Record<string, string> = {
    firstName: profile.first_name,
    lastName: profile.last_name ?? '',
    gender: profile.gender,
    dateOfBirth: profile.date_of_birth,
    heightCm: profile.height_cm === null ? '' : String(profile.height_cm),
    weightKg: profile.weight_kg === null ? '' : String(profile.weight_kg),
    physicalStatus: profile.physical_status ?? '',
    manglikStatus: profile.manglik_status ?? '',
    employedIn: profile.employed_in ?? '',
    maritalStatus: profile.marital_status ?? '',
    religion: profile.religion ?? '',
    subCaste: profile.sub_caste ?? '',
    motherTongue: profile.mother_tongue ?? '',
    swagotra: profile.swagotra ?? '',
    maternalGothra: profile.maternal_gothra ?? '',
    rashi: profile.rashi ?? '',
    nakshatra: profile.nakshatra ?? '',
    company: profile.company ?? '',
    annualIncome: profile.annual_income ?? '',
    workLocation: profile.work_location ?? '',
    fathersOccupation: profile.fathers_occupation ?? '',
    mothersOccupation: profile.mothers_occupation ?? '',
    siblings: profile.siblings ?? '',
    familyValue: profile.family_value ?? '',
    familyType: profile.family_type ?? '',
    familyStatus: profile.family_status ?? '',
    nativePlace: profile.native_place ?? '',
    brothersCount: profile.brothers_count === null ? '' : String(profile.brothers_count),
    brothersMarriedCount:
      profile.brothers_married_count === null ? '' : String(profile.brothers_married_count),
    sistersCount: profile.sisters_count === null ? '' : String(profile.sisters_count),
    sistersMarriedCount:
      profile.sisters_married_count === null ? '' : String(profile.sisters_married_count),
    familyLocation: profile.family_location ?? '',
    familyDescription: profile.family_description ?? '',
    foodPreference: profile.food_preference ?? '',
    smoking: profile.smoking ?? '',
    drinking: profile.drinking ?? '',
    city: profile.city ?? '',
    state: profile.state ?? '',
    country: profile.country ?? '',
    communityId: idForLabel(listFor(lists, 'COMMUNITY'), profile.community),
    educationId: idForLabel(listFor(lists, 'EDUCATION'), profile.education),
    professionId: idForLabel(listFor(lists, 'PROFESSION'), profile.profession),
  };
  return base;
}

/** The multi-select half of the snapshot: five sets, each compared in order. */
function toLists(profile: MyProfile): Record<string, string[]> {
  return {
    languagesKnown: [...profile.languages_known],
    hobbies: [...profile.hobbies],
    favouriteMusic: [...profile.favourite_music],
    sports: [...profile.sports],
    favouriteFood: [...profile.favourite_food],
  };
}

/** Diff a form against its snapshot, returning a PATCH body or null if none. */
function buildPatch(
  form: Record<string, string>,
  initial: Record<string, string> | null,
  multi: Record<string, string[]>,
  initialMulti: Record<string, string[]> | null,
  others: Record<string, string> = {},
): UpdateProfileInput | null {
  if (initial === null) return null;
  const payload: Record<string, unknown> = {};

  const text = (key: string, api: string, required = false) => {
    const next = (form[key] ?? '').trim();
    if (next === (initial[key] ?? '').trim()) return;
    if (next === '') {
      if (!required) payload[api] = null;
      return;
    }
    payload[api] = next;
  };

  if ((form.firstName ?? '').trim() !== (initial.firstName ?? '').trim()) {
    payload.first_name = (form.firstName ?? '').trim();
  }
  if (form.gender && form.gender !== initial.gender) payload.gender = form.gender;
  if (form.dateOfBirth !== initial.dateOfBirth) payload.date_of_birth = form.dateOfBirth;

  const height = (form.heightCm ?? '').trim();
  if (height !== (initial.heightCm ?? '').trim()) {
    payload.height_cm = height === '' ? null : Number.parseInt(height, 10);
  }
  if ((form.maritalStatus ?? '') !== (initial.maritalStatus ?? '')) {
    payload.marital_status = form.maritalStatus === '' ? null : form.maritalStatus;
  }

  text('lastName', 'last_name');
  text('religion', 'religion');
  text('subCaste', 'sub_caste');
  text('motherTongue', 'mother_tongue');
  text('swagotra', 'swagotra');
  text('maternalGothra', 'maternal_gothra');
  text('rashi', 'rashi');
  text('nakshatra', 'nakshatra');
  text('company', 'company');
  text('annualIncome', 'annual_income');
  text('workLocation', 'work_location');
  text('fathersOccupation', 'fathers_occupation');
  text('mothersOccupation', 'mothers_occupation');
  text('siblings', 'siblings');
  text('familyLocation', 'family_location');
  // The habit questions are now pickers over fixed answers, so they travel as
  // enums rather than the free text this used to send.
  for (const [key, api] of [
    ['foodPreference', 'food_preference'],
    ['smoking', 'smoking'],
    ['drinking', 'drinking'],
    ['employedIn', 'employed_in'],
  ] as const) {
    if ((form[key] ?? '') === (initial[key] ?? '')) continue;
    payload[api] = (form[key] ?? '') === '' ? null : form[key];
  }
  text('city', 'city');
  text('state', 'state');
  text('country', 'country');

  for (const key of ['familyDescription', 'aboutMe'] as const) {
    const api = key === 'familyDescription' ? 'family_description' : 'about_me';
    const next = (form[key] ?? '').trim();
    if (next === (initial[key] ?? '').trim()) continue;
    payload[api] = next === '' ? null : next;
  }

  for (const [key, api] of [
    ['communityId', 'community_id'],
    ['educationId', 'education_id'],
    ['professionId', 'profession_id'],
  ] as const) {
    if ((form[key] ?? '') === (initial[key] ?? '')) continue;
    payload[api] = form[key] === '' ? null : form[key];
  }

  const weight = (form.weightKg ?? '').trim();
  if (weight !== (initial.weightKg ?? '').trim()) {
    payload.weight_kg = weight === '' ? null : Number.parseInt(weight, 10);
  }

  // Enum answers: stored as the key the chip group chose, cleared with null.
  for (const [key, api] of [
    ['physicalStatus', 'physical_status'],
    ['manglikStatus', 'manglik_status'],
    ['familyValue', 'family_value'],
    ['familyType', 'family_type'],
    ['familyStatus', 'family_status'],
  ] as const) {
    if ((form[key] ?? '') === (initial[key] ?? '')) continue;
    payload[api] = (form[key] ?? '') === '' ? null : form[key];
  }

  for (const [key, api] of [
    ['brothersCount', 'brothers_count'],
    ['brothersMarriedCount', 'brothers_married_count'],
    ['sistersCount', 'sisters_count'],
    ['sistersMarriedCount', 'sisters_married_count'],
  ] as const) {
    const next = (form[key] ?? '').trim();
    if (next === (initial[key] ?? '').trim()) continue;
    payload[api] = next === '' ? null : Number.parseInt(next, 10);
  }

  text('nativePlace', 'native_place');

  // Lists: an emptied set is a real instruction, so it is sent as [].
  for (const [key, api] of [
    ['languagesKnown', 'languages_known'],
    ['hobbies', 'hobbies'],
    ['favouriteMusic', 'favourite_music'],
    ['sports', 'sports'],
    ['favouriteFood', 'favourite_food'],
  ] as const) {
    // The "Others" box is not a separate field: its answers join the set so the
    // profile holds one list per block, whichever way the answer was added.
    const next = [...new Set([...(multi[key] ?? []), ...extraValues(others[key])])];
    const before = initialMulti?.[key] ?? [];
    if (next.length === before.length && next.every((value, index) => value === before[index])) {
      continue;
    }
    payload[api] = next;
  }

  if (Object.keys(payload).length === 0) return null;
  return payload as UpdateProfileInput;
}

function labelFor(api: string): string {
  return api.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  section: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  error: {
    color: colors.primary,
    ...typography.caption,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textStrong,
    ...typography.title,
  },
  fieldHint: {
    color: colors.textMuted,
    ...typography.caption,
  },
  importBanner: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  importTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  importBody: {
    color: colors.textMuted,
    ...typography.caption,
  },
});
