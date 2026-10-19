import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  GENDERS,
  MARITAL_STATUSES,
  type MasterList,
  type MasterListsResponse,
  type MyProfile,
  type UpdateProfileInput,
} from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
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
  { key: 'religion', api: 'religion', maxLength: 80 },
  { key: 'motherTongue', api: 'mother_tongue', maxLength: 60 },
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
  { key: 'state', api: 'state', maxLength: 80 },
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
      setProfile(mine);
      setLists(master.lists);
      setInitial(snapshot);
      setForm(snapshot);
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

  const dobValid = /^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth ?? '');
  const nameValid = (form.firstName ?? '').trim().length > 0;
  const changes = buildPatch(form, initial);

  async function save() {
    if (!token || !changes) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiClient.updateProfile(changes, token);
      const snapshot = toForm(updated, lists);
      setProfile(updated);
      setInitial(snapshot);
      setForm(snapshot);
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

  return (
    <Screen
      title="Edit profile"
      subtitle="Your net-worth band is fixed at registration and shown read-only."
      back
      footer={
        <PrimaryButton
          label="Save changes"
          onPress={save}
          disabled={changes === null || !nameValid || !dobValid}
          loading={saving}
        />
      }
    >
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}

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
        <SelectField
          label="Marital status"
          options={MARITAL_STATUSES.map((m) => ({ value: m, label: MARITAL_LABELS[m] ?? m }))}
          value={form.maritalStatus || null}
          onChange={(v) => set('maritalStatus', v ?? '')}
        />
      </Section>

      <Section title="Community and beliefs">
        <SelectField
          label="Community"
          options={optionsFor(community)}
          value={form.communityId || null}
          onChange={(v) => set('communityId', v ?? '')}
        />
        {TEXT_FIELDS.slice(0, 6).map((spec) => (
          <TextField
            key={spec.key}
            label={labelFor(spec.api)}
            value={form[spec.key] ?? ''}
            onChangeText={(v) => set(spec.key, v)}
            maxLength={spec.maxLength}
          />
        ))}
      </Section>

      <Section title="Education and work">
        <SelectField
          label="Education"
          options={optionsFor(education)}
          value={form.educationId || null}
          onChange={(v) => set('educationId', v ?? '')}
        />
        <SelectField
          label="Profession"
          options={optionsFor(profession)}
          value={form.professionId || null}
          onChange={(v) => set('professionId', v ?? '')}
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

      <Section title="Family">
        {TEXT_FIELDS.filter((s) =>
          [
            'fathersOccupation',
            'mothersOccupation',
            'siblings',
            'familyLocation',
          ].includes(s.key),
        ).map((spec) => (
          <TextField
            key={spec.key}
            label={labelFor(spec.api)}
            value={form[spec.key] ?? ''}
            onChangeText={(v) => set(spec.key, v)}
            maxLength={spec.maxLength}
          />
        ))}
        <TextField
          label="Family description"
          value={form.familyDescription ?? ''}
          onChangeText={(v) => set('familyDescription', v)}
          multiline
          maxLength={2000}
        />
      </Section>

      <Section title="Lifestyle and about">
        {TEXT_FIELDS.filter((s) => ['foodPreference', 'smoking', 'drinking'].includes(s.key)).map(
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
        <TextField
          label="About me"
          value={form.aboutMe ?? ''}
          onChangeText={(v) => set('aboutMe', v)}
          multiline
          maxLength={2000}
        />
      </Section>

      <Section title="Location">
        {TEXT_FIELDS.filter((s) => ['city', 'state', 'country'].includes(s.key)).map((spec) => (
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function listFor(lists: MasterList[], key: string): MasterList | undefined {
  return lists.find((list) => list.key === key);
}

function optionsFor(list: MasterList | undefined) {
  return (list?.values ?? []).map((value) => ({ value: value.id, label: value.value }));
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
    maritalStatus: profile.marital_status ?? '',
    religion: profile.religion ?? '',
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

/** Diff a form against its snapshot, returning a PATCH body or null if none. */
function buildPatch(
  form: Record<string, string>,
  initial: Record<string, string> | null,
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
  text('foodPreference', 'food_preference');
  text('smoking', 'smoking');
  text('drinking', 'drinking');
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
});
