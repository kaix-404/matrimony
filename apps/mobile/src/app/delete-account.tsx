import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { OTP_CODE_LENGTH } from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { apiClient } from '../lib/api-client';
import { describeOtpSendFailure } from '../lib/api-errors';
import { useAuth } from '../lib/auth-context';
import { colors, spacing, typography } from '../theme/tokens';

type Step = 'confirm' | 'code';

function normalizeMobile(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Section 21 account deletion.
 *
 * Re-authentication is required, not a confirmation dialog: deleting an account
 * from a stolen, unlocked phone should not be one tap away. The `DELETE_ACCOUNT`
 * OTP is verified here and then spent by the delete call, so the code is bound
 * to this one irreversible action.
 */
export default function DeleteAccountScreen() {
  const { token, user, signOut } = useAuth();

  const [step, setStep] = useState<Step>('confirm');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [deliveryWarning, setDeliveryWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mobile = user?.mobile ?? '';

  async function requestCode() {
    setBusy(true);
    setError(null);
    setDeliveryWarning(null);
    try {
      const response = await apiClient.requestOtp({
        mobile: normalizeMobile(mobile),
        purpose: 'DELETE_ACCOUNT',
      });
      setDevCode(response.dev_code ?? null);
      setDeliveryWarning(response.delivery_warning ?? null);
      setStep('code');
    } catch (e) {
      // Same wording as sign-in: a code that was not sent is a refusal worth
      // naming, not a generic "could not send".
      setError(describeOtpSendFailure(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const check = await apiClient.verifyOtp({
        mobile: normalizeMobile(mobile),
        purpose: 'DELETE_ACCOUNT',
        code,
      });
      if (!check.verified) {
        setError('That code is incorrect or has expired.');
        return;
      }
      await apiClient.deleteAccount(token);
      await signOut();
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete your account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Delete account"
      subtitle="This removes your profile and cannot be undone."
      back
      footer={
        step === 'confirm' ? (
          <PrimaryButton label="Send code to confirm" onPress={requestCode} loading={busy} />
        ) : (
          <PrimaryButton
            label="Delete my account"
            onPress={confirmDelete}
            disabled={code.length !== OTP_CODE_LENGTH}
            loading={busy}
          />
        )
      }
    >
      {step === 'confirm' ? (
        <Text style={styles.body}>
          Your profile and photos will be removed. Unlocks already paid for are not refunded, and
          your data is purged after the retention period.
        </Text>
      ) : (
        <>
          <TextField
            label="Confirmation code"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH))}
            placeholder={'0'.repeat(OTP_CODE_LENGTH)}
            keyboardType="number-pad"
            maxLength={OTP_CODE_LENGTH}
            autoFocus
            error={error}
          />
          {deliveryWarning ? <Text style={styles.warning}>{deliveryWarning}</Text> : null}
          {devCode ? <Text style={styles.devHint}>Development code: {devCode}</Text> : null}
        </>
      )}
      {step === 'confirm' && error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.textStrong,
    ...typography.body,
  },
  warning: {
    color: colors.primary,
    ...typography.body,
  },
  devHint: {
    color: colors.textMuted,
    ...typography.caption,
  },
  error: {
    color: colors.primary,
    ...typography.caption,
    paddingTop: spacing.sm,
  },
});
