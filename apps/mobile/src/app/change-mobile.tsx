import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { OTP_CODE_LENGTH } from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, spacing, typography } from '../theme/tokens';

/** Digits only, so a pasted "+91 98765 43210" is normalised like the API does. */
function normalizeMobile(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

/**
 * Moving the account to a different mobile number.
 *
 * The number is how the member signs in, so this is a two-step verified swap: a
 * code goes to the NEW number and must be typed back before anything changes.
 * The screen says plainly what happens afterwards — other devices are signed out,
 * and the number is what they will sign in with from now on — because a member
 * who changes it without reading that will report being logged out as a bug.
 *
 * The current number is deliberately not shown here: the profile screen already
 * shows it, and repeating it on a form invites editing the wrong field.
 */
export default function ChangeMobileScreen() {
  const { ready } = useRequireAuth();
  const { token, replaceSession } = useAuth();

  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'number' | 'code'>('number');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeMobile(mobile);
  const validNumber = /^[6-9]\d{9}$/.test(normalized);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.requestOtp({ mobile: normalized, purpose: 'CHANGE_MOBILE' });
      setResendIn(result.resend_after_seconds);
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const tokens = await apiClient.changeMobile({ mobile: normalized, code }, token);
      // Every session on the old number was revoked on the server, including this
      // one; adopting the new pair is what keeps this device signed in.
      await replaceSession(tokens);
      router.replace('/settings');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change your number.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  if (step === 'number') {
    return (
      <Screen
        title="Change mobile number"
        subtitle="We will text a code to the new number. You will sign in with it from now on."
        back
        footer={
          <PrimaryButton
            label="Send code"
            onPress={sendCode}
            disabled={!validNumber || busy}
            loading={busy}
          />
        }
      >
        <TextField
          label="New mobile number"
          value={mobile}
          onChangeText={setMobile}
          placeholder="98765 43210"
          keyboardType="phone-pad"
          maxLength={14}
          autoFocus
          error={mobile.length > 0 && !validNumber ? 'Enter a 10-digit mobile number' : null}
        />
        <Text style={styles.note}>
          Changing the number signs out every other device. Your profile, unlocks and verification
          stay exactly as they are.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Screen>
    );
  }

  return (
    <Screen
      title="Enter the code"
      subtitle={`Sent to +91 ${normalized}.`}
      back
      onBack={() => setStep('number')}
      footer={
        <>
          <PrimaryButton
            label="Change my number"
            onPress={submit}
            disabled={code.length !== OTP_CODE_LENGTH || busy}
            loading={busy}
          />
          <PrimaryButton
            variant="outline"
            label={resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            onPress={sendCode}
            disabled={resendIn > 0 || busy}
          />
        </>
      }
    >
      <TextField
        label={`${OTP_CODE_LENGTH}-digit code`}
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH))}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={OTP_CODE_LENGTH}
        autoFocus
      />
      <Text style={styles.note}>
        If the code does not arrive, wait for the resend timer rather than requesting another — the
        newest code is the only one that works.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: {
    color: colors.textMuted,
    ...typography.caption,
  },
  error: {
    color: colors.primary,
    ...typography.caption,
    paddingTop: spacing.sm,
  },
});
