import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { GENDERS } from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SelectList, type SelectOption } from '../components/SelectList';
import { TextField } from '../components/TextField';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { colors, spacing, typography } from '../theme/tokens';

const GENDER_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
};

const GENDER_OPTIONS: SelectOption[] = GENDERS.map((gender) => ({
  value: gender,
  label: GENDER_LABELS[gender] ?? gender,
}));

/**
 * Creates the profile row.
 *
 * Registration mints the account; this is the first write to `Profile`, and
 * only section 8's three non-nullable fields are collected here. Everything
 * else is optional server-side and is deliberately left for the profile screen:
 * asking for thirty fields before a user has seen the product is how sign-up
 * gets abandoned. The screen is reached only right after registration, so it
 * does not offer a back button.
 */
export default function OnboardingScreen() {
  const { token, refreshUser } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dobValid = /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth);
  const canSubmit = firstName.trim().length > 0 && gender !== null && dobValid;

  async function submit() {
    if (!token || gender === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.createProfile(
        {
          first_name: firstName.trim(),
          last_name: lastName.trim() ? lastName.trim() : null,
          gender: gender as (typeof GENDERS)[number],
          date_of_birth: dateOfBirth,
        },
        token,
      );
      await refreshUser();
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen
      title="Tell us about you"
      subtitle="Your name, gender and date of birth are required. You can add the rest later."
      footer={
        <PrimaryButton
          label="Save and continue"
          onPress={submit}
          disabled={!canSubmit}
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
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: {
    color: colors.primary,
    ...typography.caption,
    paddingTop: spacing.sm,
  },
});
