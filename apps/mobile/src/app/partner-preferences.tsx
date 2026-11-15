import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ANNUAL_INCOME_BANDS,
  COUNTRY_OPTIONS,
  DRINKING_HABITS,
  EATING_HABITS,
  EMPLOYED_IN,
  GENDER_PREFERENCES,
  KUJA_DOSHAM_VALUES,
  MARITAL_STATUSES,
  PHYSICAL_STATUSES,
  SMOKING_HABITS,
  type MasterList,
  type PreferenceFilterKey,
} from '@matrimony/shared';
import { CheckboxField } from '../components/CheckboxField';
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

const PHYSICAL_LABELS: Record<string, string> = {
  NORMAL: 'Normal',
  PHYSICALLY_CHALLENGED: 'Physically challenged',
};

const KUJA_LABELS: Record<string, string> = {
  YES: 'Yes',
  NO: 'No',
  DONT_KNOW: "Don't know",
};

const GENDER_OPTIONS: SelectOption[] = GENDER_PREFERENCES.map((value) => ({
  value,
  label: GENDER_LABELS[value] ?? value,
}));

const MARITAL_OPTIONS: SelectOption[] = MARITAL_STATUSES.map((value) => ({
  value,
  label: MARITAL_LABELS[value] ?? value,
}));

const COUNTRY_SELECT: SelectOption[] = COUNTRY_OPTIONS.map((country) => ({
  value: country.code,
  label: `${country.label} (${country.code})`,
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
  country: string | null;
  city: string;
  state: string | null;
  physicalStatus: string[];
  eating: string[];
  drinking: string[];
  smoking: string[];
  kuja: string[];
  employedIn: string[];
  income: string[];
  compulsory: PreferenceFilterKey[];
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
  country: null,
  city: '',
  state: null,
  physicalStatus: [],
  eating: [],
  drinking: [],
  smoking: [],
  kuja: [],
  employedIn: [],
  income: [],
  compulsory: [],
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

const text = (value: number | null): string => (value === null ? '' : String(value));

/**
 * The partner preferences that narrow the discovery feed.
 *
 * Laid out as the client's reference has it: one row per answer, with a
 * "Compulsory" tick beside it. A ticked answer is a hard filter — the reference
 * warns that ticked filters are exactly why matches drop away — and an unticked
 * one is only stated. When nothing is ticked every saved answer still filters,
 * which is how this screen behaved before the ticks existed.
 *
 * A field left empty is not a default: it is the absence of a constraint, which
 * is why every one of them can be cleared again. The preference is a filter on
 * what this member sees, not a limit on who may see them — the two-way
 * visibility lists in Settings decide that, and saving here never touches them.
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
      const p = state.preference;
      const next: FormState = {
        gender: p.gender,
        ageMin: text(p.age_min),
        ageMax: text(p.age_max),
        heightMin: text(p.height_min_cm),
        heightMax: text(p.height_max_cm),
        maritalStatus: p.marital_status,
        religion: p.religion,
        subCaste: p.sub_caste,
        educationId: p.education_id,
        professionId: p.profession_id,
        motherTongue: p.mother_tongue,
        country: p.country,
        city: p.city ?? '',
        state: p.state,
        physicalStatus: [...p.physical_status],
        eating: [...p.eating_habits],
        drinking: [...p.drinking_habits],
        smoking: [...p.smoking_habits],
        kuja: [...p.kuja_dosham],
        employedIn: [...p.employed_in],
        income: [...p.annual_income_bands],
        compulsory: [...p.compulsory],
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

  /** Tick or untick a preference as a hard filter. */
  function toggleCompulsory(key: PreferenceFilterKey) {
    set(
      'compulsory',
      form.compulsory.includes(key)
        ? form.compulsory.filter((item) => item !== key)
        : [...form.compulsory, key],
    );
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
          country: form.country,
          city: toText(form.city),
          state: form.state,
          physical_status: form.physicalStatus as never,
          eating_habits: form.eating as never,
          drinking_habits: form.drinking as never,
          smoking_habits: form.smoking as never,
          kuja_dosham: form.kuja as never,
          employed_in: form.employedIn as never,
          annual_income_bands: form.income as never,
          compulsory: form.compulsory,
        },
        token,
      );
      setConfigured(state.configured);
      const p = state.preference;
      const next: FormState = {
        ...form,
        ageMin: text(p.age_min),
        ageMax: text(p.age_max),
        heightMin: text(p.height_min_cm),
        heightMax: text(p.height_max_cm),
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

  const count = form.compulsory.length;

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

      <Text style={styles.hint}>
        Turn on “Compulsory” beside an answer to make it a hard filter. Those are the only answers
        that remove profiles from your feed — the others are what we recommend by. The ticks work
        both ways: your profile is hidden from members whose own compulsory filters it does not
        meet.
        {count > 0 ? ` ${count} compulsory ${count === 1 ? 'filter' : 'filters'}.` : ''}
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Looking for</Text>
        <Field
          label="Gender"
          ticked={form.compulsory.includes('gender')}
          onToggle={() => toggleCompulsory('gender')}
        >
          <SelectList
            options={GENDER_OPTIONS}
            value={form.gender}
            onChange={(v) => set('gender', v ?? 'ANY')}
          />
        </Field>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Age</Text>
        <Field
          label="Age range"
          ticked={form.compulsory.includes('age')}
          onToggle={() => toggleCompulsory('age')}
        >
          <View style={styles.pair}>
            <View style={styles.half}>
              <TextField
                label="Minimum"
                value={form.ageMin}
                onChangeText={(v) => set('ageMin', v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="Any"
              />
            </View>
            <View style={styles.half}>
              <TextField
                label="Maximum"
                value={form.ageMax}
                onChangeText={(v) => set('ageMax', v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="Any"
              />
            </View>
          </View>
        </Field>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Height</Text>
        <Field
          label="Height range (cm)"
          ticked={form.compulsory.includes('height')}
          onToggle={() => toggleCompulsory('height')}
        >
          <View style={styles.pair}>
            <View style={styles.half}>
              <TextField
                label="Minimum"
                value={form.heightMin}
                onChangeText={(v) => set('heightMin', v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="Any"
              />
            </View>
            <View style={styles.half}>
              <TextField
                label="Maximum"
                value={form.heightMax}
                onChangeText={(v) => set('heightMax', v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="Any"
              />
            </View>
          </View>
        </Field>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Community</Text>
        <Field
          label="Marital status"
          ticked={form.compulsory.includes('marital_status')}
          onToggle={() => toggleCompulsory('marital_status')}
        >
          <SelectField
            label="Marital status"
            options={MARITAL_OPTIONS}
            value={form.maritalStatus}
            onChange={(v) => set('maritalStatus', v)}
          />
        </Field>
        <Field
          label="Religion"
          ticked={form.compulsory.includes('religion')}
          onToggle={() => toggleCompulsory('religion')}
        >
          <SelectField
            label="Religion"
            options={withCurrent(textOptions(religionList), form.religion ?? '')}
            value={form.religion}
            onChange={changeReligion}
            placeholder="Any"
          />
        </Field>
        <Field
          label="Sub-caste"
          ticked={form.compulsory.includes('sub_caste')}
          onToggle={() => toggleCompulsory('sub_caste')}
        >
          <SelectField
            label="Sub-caste"
            options={subCasteOptions(casteList, form.religion ?? '')}
            value={form.subCaste}
            onChange={(v) => set('subCaste', v)}
            placeholder={form.religion ? 'Any' : 'Choose a religion first'}
          />
        </Field>
        <Field
          label="Mother tongue"
          ticked={form.compulsory.includes('mother_tongue')}
          onToggle={() => toggleCompulsory('mother_tongue')}
        >
          <SelectField
            label="Mother tongue"
            options={withCurrent(textOptions(motherTongueList), form.motherTongue ?? '')}
            value={form.motherTongue}
            onChange={(v) => set('motherTongue', v)}
            placeholder="Any"
          />
        </Field>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Status and beliefs</Text>
        <Field
          label="Physical status"
          ticked={form.compulsory.includes('physical_status')}
          onToggle={() => toggleCompulsory('physical_status')}
        >
          <CheckboxField
            label="Acceptable physical status"
            options={PHYSICAL_STATUSES}
            labels={PHYSICAL_LABELS}
            selected={form.physicalStatus}
            onChange={(next) => set('physicalStatus', next)}
          />
        </Field>
        <Field
          label="Kuja dosham"
          ticked={form.compulsory.includes('kuja_dosham')}
          onToggle={() => toggleCompulsory('kuja_dosham')}
        >
          <CheckboxField
            label="Acceptable answers"
            options={KUJA_DOSHAM_VALUES}
            labels={KUJA_LABELS}
            selected={form.kuja}
            onChange={(next) => set('kuja', next)}
          />
        </Field>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Habits</Text>
        <Field
          label="Eating habits"
          ticked={form.compulsory.includes('eating')}
          onToggle={() => toggleCompulsory('eating')}
        >
          <CheckboxField
            label="Acceptable eating habits"
            options={EATING_HABITS}
            selected={form.eating}
            onChange={(next) => set('eating', next)}
          />
        </Field>
        <Field
          label="Drinking habits"
          ticked={form.compulsory.includes('drinking')}
          onToggle={() => toggleCompulsory('drinking')}
        >
          <CheckboxField
            label="Acceptable drinking habits"
            options={DRINKING_HABITS}
            selected={form.drinking}
            onChange={(next) => set('drinking', next)}
          />
        </Field>
        <Field
          label="Smoking habits"
          ticked={form.compulsory.includes('smoking')}
          onToggle={() => toggleCompulsory('smoking')}
        >
          <CheckboxField
            label="Acceptable smoking habits"
            options={SMOKING_HABITS}
            selected={form.smoking}
            onChange={(next) => set('smoking', next)}
          />
        </Field>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Education and career</Text>
        <Field
          label="Education"
          ticked={form.compulsory.includes('education')}
          onToggle={() => toggleCompulsory('education')}
        >
          <SelectField
            label="Education"
            options={idOptions(educationList)}
            value={form.educationId}
            onChange={(v) => set('educationId', v)}
            placeholder="Any"
          />
        </Field>
        <Field
          label="Employed in"
          ticked={form.compulsory.includes('employed_in')}
          onToggle={() => toggleCompulsory('employed_in')}
        >
          <CheckboxField
            label="Acceptable sectors"
            options={EMPLOYED_IN}
            selected={form.employedIn}
            onChange={(next) => set('employedIn', next)}
          />
        </Field>
        <Field
          label="Occupation"
          ticked={form.compulsory.includes('occupation')}
          onToggle={() => toggleCompulsory('occupation')}
        >
          <SelectField
            label="Occupation"
            options={idOptions(professionList)}
            value={form.professionId}
            onChange={(v) => set('professionId', v)}
            placeholder="Any"
          />
        </Field>
        <Field
          label="Annual income"
          ticked={form.compulsory.includes('annual_income')}
          onToggle={() => toggleCompulsory('annual_income')}
        >
          <CheckboxField
            label="Acceptable bands"
            options={ANNUAL_INCOME_BANDS}
            selected={form.income}
            onChange={(next) => set('income', next)}
          />
          <Text style={styles.hint}>
            Income is recorded on profiles as free text, so this answer is saved but does not remove
            profiles from your feed yet.
          </Text>
        </Field>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location</Text>
        <Field
          label="Country"
          ticked={form.compulsory.includes('country')}
          onToggle={() => toggleCompulsory('country')}
        >
          <SelectField
            label="Country"
            options={withCurrent(COUNTRY_SELECT, countryLabel(form.country))}
            value={form.country}
            onChange={(v) => set('country', v)}
            placeholder="Any"
          />
        </Field>
        <Field
          label="State"
          ticked={form.compulsory.includes('state')}
          onToggle={() => toggleCompulsory('state')}
        >
          <SelectField
            label="State"
            options={withCurrent(textOptions(stateList), form.state ?? '')}
            value={form.state}
            onChange={(v) => set('state', v)}
            placeholder="Any"
          />
        </Field>
        <Field
          label="City"
          ticked={form.compulsory.includes('city')}
          onToggle={() => toggleCompulsory('city')}
        >
          <TextField
            label="City"
            value={form.city}
            onChangeText={(v) => set('city', v)}
            maxLength={80}
            autoCapitalize="words"
            placeholder="Any"
          />
        </Field>
      </View>

      <Text style={styles.hint}>
        A profile that leaves one of these fields blank will not match it — asking for Hindu
        profiles does not turn up profiles whose religion nobody filled in.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

/**
 * One preference row: the question, a Compulsory tick, and the answer beneath.
 *
 * The tick sits on the row rather than inside each control because the client's
 * reference has it that way — a checkbox beside the label, green when on.
 */
function Field({
  label,
  ticked,
  onToggle,
  children,
}: {
  label: string;
  ticked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: ticked }}
          accessibilityLabel={`Make ${label} compulsory`}
          onPress={onToggle}
          style={styles.tick}
          hitSlop={8}
        >
          <Ionicons
            name={ticked ? 'checkbox' : 'square-outline'}
            size={18}
            color={ticked ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.tickLabel, ticked ? styles.tickOn : null]}>Compulsory</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

/** The label to show for a stored country code, so an old value still reads. */
function countryLabel(code: string | null): string {
  if (!code) return '';
  const match = COUNTRY_OPTIONS.find((country) => country.code === code.toUpperCase());
  return match ? `${match.label} (${match.code})` : code.toUpperCase();
}

const styles = StyleSheet.create({
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  section: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.cardMd,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  field: {
    gap: spacing.sm,
  },
  fieldHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  fieldLabel: {
    flex: 1,
    color: colors.textStrong,
    ...typography.title,
  },
  tick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tickLabel: {
    color: colors.textMuted,
    ...typography.caption,
  },
  tickOn: {
    color: colors.primary,
    fontWeight: '600',
  },
  pair: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  half: {
    flex: 1,
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
