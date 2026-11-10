import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GENDER_PREFERENCES, MARITAL_STATUSES, type MasterList } from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SelectField } from '../components/SelectField';
import { SelectList, type SelectOption } from '../components/SelectList';
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
import { colors, radii, spacing, typography } from '../theme/tokens';

const GENDER_LABELS: Record<string, string> = {
  ANY: 'Anyone',
  MALE: 'Groom (male)',
  FEMALE: 'Bride (female)',
};

const MARITAL_LABELS: Record<string, string> = {
  NEVER_MARRIED: 'Never married',
  DIVORCED: 'Divorced',
  WIDOWED: 'Widowed',
  AWAITING_DIVORCE: 'Awaiting divorce',
  ANNULLED: 'Annulled',
};

const GENDER_OPTIONS: SelectOption[] = GENDER_PREFERENCES.map((value) => ({
  value,
  label: GENDER_LABELS[value] ?? value,
}));

const MARITAL_OPTIONS: SelectOption[] = MARITAL_STATUSES.map((value) => ({
  value,
  label: MARITAL_LABELS[value] ?? value,
}));

interface FormState {
  gender: string;
  ageMin: string;
  ageMax: string;
  heightMin: string;
  heightMax: string;
  maritalStatus: string | null;
  religion: string | null;
  subCaste: string | null;
  educationId: string | null;
  professionId: string | null;
  motherTongue: string | null;
  city: string;
  state: string | null;
}

const EMPTY_FORM: FormState = {
  gender: 'ANY',
  ageMin: '',
  ageMax: '',
  heightMin: '',
  heightMax: '',
  maritalStatus: null,
  religion: null,
  subCaste: null,
  educationId: null,
  professionId: null,
  motherTongue: null,
  city: '',
  state: null,
};

/** Empty means no constraint, never zero. */
function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value: string): string | null {
  return value.trim().length === 0 ? null : value.trim();
}

/**
 * The partner preferences that narrow the discovery feed.
 *
 * A field left empty is not a default: it is the absence of a constraint, which
 * is why every one of them can be cleared again. The screen says so in the hint,
 * because "why am I seeing fewer profiles" is otherwise unanswerable from
 * inside the feed.
 *
 * The preference is a filter on what this member sees, not a limit on who may
 * see them — the two-way visibility lists in Settings decide that, and saving
 * here never touches them.
 */
export default function PartnerPreferencesScreen() {
  const { ready } = useRequireAuth();
  const { token } = useAuth();

  const [lists, setLists] = useState<MasterList[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pristine, setPristine] = useState<FormState>(EMPTY_FORM);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [state, master] = await Promise.all([
        apiClient.getPartnerPreference(token),
        apiClient.getMasterLists(),
      ]);
      const next: FormState = {
        gender: state.preference.gender,
        ageMin: state.preference.age_min === null ? '' : String(state.preference.age_min),
        ageMax: state.preference.age_max === null ? '' : String(state.preference.age_max),
        heightMin:
          state.preference.height_min_cm === null ? '' : String(state.preference.height_min_cm),
        heightMax:
          state.preference.height_max_cm === null ? '' : String(state.preference.height_max_cm),
        maritalStatus: state.preference.marital_status,
        religion: state.preference.religion,
        subCaste: state.preference.sub_caste,
        educationId: state.preference.education_id,
        professionId: state.preference.profession_id,
        motherTongue: state.preference.mother_tongue,
        city: state.preference.city ?? '',
        state: state.preference.state,
      };
      setLists(master.lists);
      setForm(next);
      setPristine(next);
      setConfigured(state.configured);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your preferences.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const changed = JSON.stringify(form) !== JSON.stringify(pristine);

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const state = await apiClient.savePartnerPreference(
        {
          gender: form.gender as (typeof GENDER_PREFERENCES)[number],
          age_min: toNumber(form.ageMin),
          age_max: toNumber(form.ageMax),
          height_min_cm: toNumber(form.heightMin),
          height_max_cm: toNumber(form.heightMax),
          marital_status: form.maritalStatus as (typeof MARITAL_STATUSES)[number] | null,
          religion: form.religion,
          sub_caste: form.subCaste,
          education_id: form.educationId,
          profession_id: form.professionId,
          mother_tongue: form.motherTongue,
          country: null,
          city: toText(form.city),
          state: form.state,
        },
        token,
      );
      setConfigured(state.configured);
      const next: FormState = {
        ...form,
        ageMin: state.preference.age_min === null ? '' : String(state.preference.age_min),
        ageMax: state.preference.age_max === null ? '' : String(state.preference.age_max),
        heightMin:
          state.preference.height_min_cm === null ? '' : String(state.preference.height_min_cm),
        heightMax:
          state.preference.height_max_cm === null ? '' : String(state.preference.height_max_cm),
      };
      setForm(next);
      setPristine(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your preferences.');
    } finally {
      setSaving(false);
    }
  }

  if (!ready || loading) {
    return (
      <Screen title="Partner preferences" back>
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const religionList = listFor(lists, 'RELIGION');
  const motherTongueList = listFor(lists, 'MOTHER_TONGUE');
  const casteList = listFor(lists, 'CASTE');
  const stateList = listFor(lists, 'STATE');
  const educationList = listFor(lists, 'EDUCATION');
  const professionList = listFor(lists, 'PROFESSION');

  /**
   * Religion and sub-caste are stored as labels, and the sub-caste list is
   * religion-scoped, so a new religion drops a sub-caste that no longer belongs
   * to it — the same rule the profile editor applies.
   */
  function changeReligion(next: string | null) {
    setSaved(false);
    setForm((prev) => ({
      ...prev,
      religion: next,
      subCaste:
        next !== null && subCasteOptions(casteList, next).some((o) => o.value === prev.subCaste)
          ? prev.subCaste
          : null,
    }));
  }

  return (
    <Screen
      title="Partner preferences"
      subtitle="These narrow the profiles in your feed. Leave a field empty to place no restriction."
      back
      footer={
        <PrimaryButton
          label={saved && !changed ? 'Saved' : 'Save preferences'}
          onPress={save}
          disabled={!changed}
          loading={saving}
        />
      }
    >
      {!configured ? (
        <Text style={styles.hint}>
          You have not set a preference yet, so you see every profile your visibility settings
          allow.
        </Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Looking for</Text>
        <SelectList
          options={GENDER_OPTIONS}
          value={form.gender}
          onChange={(v) => set('gender', v ?? 'ANY')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Age</Text>
        <TextField
          label="Minimum age"
          value={form.ageMin}
          onChangeText={(v) => set('ageMin', v)}
          keyboardType="number-pad"
          maxLength={3}
          placeholder="Any"
        />
        <TextField
          label="Maximum age"
          value={form.ageMax}
          onChangeText={(v) => set('ageMax', v)}
          keyboardType="number-pad"
          maxLength={3}
          placeholder="Any"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Height</Text>
        <TextField
          label="Minimum height (cm)"
          value={form.heightMin}
          onChangeText={(v) => set('heightMin', v)}
          keyboardType="number-pad"
          maxLength={3}
          placeholder="Any"
        />
        <TextField
          label="Maximum height (cm)"
          value={form.heightMax}
          onChangeText={(v) => set('heightMax', v)}
          keyboardType="number-pad"
          maxLength={3}
          placeholder="Any"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Community</Text>
        <SelectField
          label="Marital status"
          options={MARITAL_OPTIONS}
          value={form.maritalStatus}
          onChange={(v) => set('maritalStatus', v)}
        />
        <SelectField
          label="Religion"
          options={withCurrent(textOptions(religionList), form.religion ?? '')}
          value={form.religion}
          onChange={changeReligion}
          placeholder="Any"
        />
        <SelectField
          label="Sub-caste"
          options={subCasteOptions(casteList, form.religion ?? '')}
          value={form.subCaste}
          onChange={(v) => set('subCaste', v)}
          placeholder={form.religion ? 'Any' : 'Choose a religion first'}
        />
        <SelectField
          label="Mother tongue"
          options={withCurrent(textOptions(motherTongueList), form.motherTongue ?? '')}
          value={form.motherTongue}
          onChange={(v) => set('motherTongue', v)}
          placeholder="Any"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Education and career</Text>
        <SelectField
          label="Education"
          options={idOptions(educationList)}
          value={form.educationId}
          onChange={(v) => set('educationId', v)}
          placeholder="Any"
        />
        <SelectField
          label="Profession"
          options={idOptions(professionList)}
          value={form.professionId}
          onChange={(v) => set('professionId', v)}
          placeholder="Any"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location</Text>
        <TextField
          label="City"
          value={form.city}
          onChangeText={(v) => set('city', v)}
          maxLength={80}
          autoCapitalize="words"
          placeholder="Any"
        />
        <SelectField
          label="State"
          options={withCurrent(textOptions(stateList), form.state ?? '')}
          value={form.state}
          onChange={(v) => set('state', v)}
          placeholder="Any"
        />
      </View>

      <Text style={styles.hint}>
        A profile that leaves one of these fields blank will not match it — asking for Hindu
        profiles does not turn up profiles whose religion nobody filled in.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  section: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.cardMd,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  hint: {
    color: colors.textMuted,
    ...typography.caption,
  },
  error: {
    color: colors.primary,
    ...typography.caption,
  },
});
