import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { GENDERS, MARITAL_STATUSES } from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SelectList, type SelectOption } from '../components/SelectList';
import { TextField } from '../components/TextField';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { colors, radii, spacing, typography } from '../theme/tokens';

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
  ANNULLED: 'Annulled',
};

const GENDER_OPTIONS: SelectOption[] = GENDERS.map((gender) => ({
  value: gender,
  label: GENDER_LABELS[gender] ?? gender,
}));

const MARITAL_OPTIONS: SelectOption[] = MARITAL_STATUSES.map((status) => ({
  value: status,
  label: MARITAL_LABELS[status] ?? status,
}));

type Step = 'details' | 'review';

/**
 * Sets up the profile, then hands the member to KYC.
 *
 * Registration mints the account; this is the first write to `Profile`. It asks
 * for the three fields section 8 requires and, on the same screen, the details a
 * matrimony profile is actually read for — religion, mother tongue, height,
 * marital status, location, a few lines about the member — because asking for
 * them here is the point at which the member is already filling a form. Anything
 * left blank stays editable from Edit profile.
 *
 * Two ways to fill it: type the details, or upload a bio-data document and let
 * the app pre-fill them. The upload path needs a profile row to write into, so it
 * creates one from the required fields first and continues on the import screen,
 * which shows every extracted value before saving anything.
 *
 * The last step is a review: what was entered, and one button — KYC verification
 * — which saves, submits the profile for review and opens the identity check. An
 * unverified member is not discoverable, so that check is the next thing the
 * product needs from them; leaving them on a feed they cannot act in was the old
 * behaviour.
 */
export default function OnboardingScreen() {
  const { token, refreshUser } = useAuth();

  const [step, setStep] = useState<Step>('details');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [maritalStatus, setMaritalStatus] = useState<string | null>(null);
  const [religion, setReligion] = useState('');
  const [motherTongue, setMotherTongue] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [aboutMe, setAboutMe] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dobValid = /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth);
  const heightValid = heightCm.length === 0 || /^\d{2,3}$/.test(heightCm);
  const canContinue = firstName.trim().length > 0 && gender !== null && dobValid && heightValid;

  /** The create payload, absent fields omitted rather than sent as empty strings. */
  function profileInput() {
    const height = heightCm.length > 0 ? Number(heightCm) : null;
    return {
      first_name: firstName.trim(),
      last_name: lastName.trim() ? lastName.trim() : null,
      gender: gender as (typeof GENDERS)[number],
      date_of_birth: dateOfBirth,
      height_cm: height,
      marital_status: (maritalStatus as (typeof MARITAL_STATUSES)[number] | null) ?? null,
      religion: religion.trim() ? religion.trim() : null,
      mother_tongue: motherTongue.trim() ? motherTongue.trim() : null,
      city: city.trim() ? city.trim() : null,
      state: state.trim() ? state.trim() : null,
      about_me: aboutMe.trim() ? aboutMe.trim() : null,
    };
  }

  /**
   * Creates the profile and lands on the identity check.
   *
   * Submitting for review is best-effort: the profile is saved either way, and a
   * failure there is not a failed signup — the profile screen can submit it.
   */
  async function saveAndVerify() {
    if (!token || gender === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.createProfile(profileInput(), token);
      await apiClient.submitProfileForReview(token).catch(() => undefined);
      await refreshUser();
      router.replace('/verification');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
      setStep('details');
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Creates the row the bio-data import writes into, then opens the uploader.
   *
   * The import screen saves through a profile update, which needs the row to
   * exist. It also replaces the review step rather than returning to it: it lists
   * every extracted value for confirmation already, so a second review of the
   * same details would be a duplicate. `next=verification` sends the member on to
   * the identity check when the import finishes.
   */
  async function startBiodataImport() {
    if (!token || gender === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.createProfile(profileInput(), token);
      await refreshUser();
      router.replace({ pathname: '/biodata-import', params: { next: 'verification' } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'review') {
    const rows: Array<[string, string]> = [
      ['Name', [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')],
      ['Gender', gender ? (GENDER_LABELS[gender] ?? gender) : '—'],
      ['Date of birth', dateOfBirth],
      ['Height', heightCm ? `${heightCm} cm` : '—'],
      ['Marital status', maritalStatus ? (MARITAL_LABELS[maritalStatus] ?? maritalStatus) : '—'],
      ['Religion', religion.trim() || '—'],
      ['Mother tongue', motherTongue.trim() || '—'],
      ['Location', [city.trim(), state.trim()].filter(Boolean).join(', ') || '—'],
    ];

    return (
      <Screen
        title="Review your details"
        subtitle="Check what you entered. You can edit any of it later from your profile."
        footer={
          <PrimaryButton
            label="KYC verification"
            onPress={saveAndVerify}
            loading={submitting}
            disabled={submitting}
          />
        }
      >
        <View style={styles.card}>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowValue}>{value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>About you</Text>
        <Text style={styles.reviewBody}>{aboutMe.trim() || 'Not added yet.'}</Text>

        <Text style={styles.note}>
          As per Government of India norms, KYC verification for Aadhaar is required. Your profile
          will be offline until it is completed.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton
          variant="outline"
          label="Edit details"
          onPress={() => setStep('details')}
          disabled={submitting}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Set up your matrimony profile"
      subtitle="These details are what other families will read. Only the first three are required."
      footer={
        <PrimaryButton
          label="Continue"
          onPress={() => setStep('review')}
          disabled={!canContinue}
          loading={submitting}
        />
      }
    >
      <TextField
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        placeholder="Anjali"
        autoCapitalize="words"
        maxLength={80}
        autoFocus
      />
      <TextField
        label="Last name (optional)"
        value={lastName}
        onChangeText={setLastName}
        placeholder="Sharma"
        autoCapitalize="words"
        maxLength={80}
      />
      <SelectList options={GENDER_OPTIONS} value={gender} onChange={setGender} />
      <TextField
        label="Date of birth"
        value={dateOfBirth}
        onChangeText={setDateOfBirth}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        error={dateOfBirth.length > 0 && !dobValid ? 'Use YYYY-MM-DD' : null}
      />

      <Text style={styles.sectionTitle}>More about you</Text>
      <TextField
        label="Height (cm, optional)"
        value={heightCm}
        onChangeText={setHeightCm}
        placeholder="165"
        keyboardType="number-pad"
        maxLength={3}
        error={heightCm.length > 0 && !heightValid ? 'Use centimetres, e.g. 165' : null}
      />
      <SelectList options={MARITAL_OPTIONS} value={maritalStatus} onChange={setMaritalStatus} />
      <TextField
        label="Religion (optional)"
        value={religion}
        onChangeText={setReligion}
        maxLength={80}
        autoCapitalize="words"
      />
      <TextField
        label="Mother tongue (optional)"
        value={motherTongue}
        onChangeText={setMotherTongue}
        maxLength={60}
        autoCapitalize="words"
      />
      <TextField
        label="City (optional)"
        value={city}
        onChangeText={setCity}
        maxLength={80}
        autoCapitalize="words"
      />
      <TextField
        label="State (optional)"
        value={state}
        onChangeText={setState}
        maxLength={80}
        autoCapitalize="words"
      />
      <TextField
        label="About you (optional)"
        value={aboutMe}
        onChangeText={setAboutMe}
        placeholder="Family, work, what you are looking for"
        multiline
        maxLength={2000}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.upload}>
        <Text style={styles.uploadHint}>
          Have a bio-data ready? Create the profile and upload the document — the app fills in the
          details from it, and you confirm each one before saving.
        </Text>
        <PrimaryButton
          variant="outline"
          label="Upload bio-data instead"
          onPress={startBiodataImport}
          disabled={!canContinue || submitting}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.cardMd,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowLabel: {
    color: colors.textMuted,
    ...typography.caption,
  },
  rowValue: {
    color: colors.textPrimary,
    ...typography.body,
    flexShrink: 1,
    textAlign: 'right',
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  reviewBody: {
    color: colors.textMuted,
    ...typography.body,
  },
  note: {
    color: colors.textMuted,
    ...typography.caption,
  },
  upload: {
    gap: spacing.sm,
  },
  uploadHint: {
    color: colors.textMuted,
    ...typography.caption,
  },
  error: {
    color: colors.primary,
    ...typography.caption,
  },
});
