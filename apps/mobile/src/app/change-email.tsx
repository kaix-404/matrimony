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

/**
 * The same loose check the address field needs, and no more.
 *
 * The server owns the real rule (`EmailAddressSchema`, lower-cased and validated
 * with Zod); this exists only so the button can be disabled while the member is
 * still typing. A stricter pattern here would refuse addresses the server would
 * accept, which is how a valid mailbox becomes impossible to enter.
 */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adding an email to the account, or moving it to a different address.
 *
 * Two steps, like the number change: a code goes to the NEW address and must be
 * typed back before anything is stored. Saying so matters here — a member who
 * expects the address to change the moment they type it will report "it didn't
 * save" when they miss the code step.
 *
 * The copy also says what the email is *not*: it does not become a way to sign
 * in, and it does not sign other devices out. Both are true of the API, and both
 * are the questions someone adding an email actually has.
 */
export default function ChangeEmailScreen() {
  const { ready } = useRequireAuth();
  const { token } = useAuth();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'address' | 'code'>('address');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const trimmed = email.trim().toLowerCase();
  const validEmail = LOOKS_LIKE_EMAIL.test(trimmed);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function sendCode() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.requestEmailOtp(trimmed, token);
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
      await apiClient.changeEmail({ email: trimmed, code }, token);
      router.replace('/settings');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your email address.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  if (step === 'address') {
    return (
      <Screen
        title="Add or change email"
        subtitle="We will email a code to the address. It is not used to sign in."
        back
        footer={
          <PrimaryButton
            label="Send code"
            onPress={sendCode}
            disabled={!validEmail || busy}
            loading={busy}
          />
        }
      >
        <TextField
          label="Email address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          maxLength={254}
          autoFocus
          error={email.length > 0 && !validEmail ? 'Enter a valid email address' : null}
        />
        <Text style={styles.note}>
          You stay signed in on this device and on any others. The address is used for account
          messages, and you can change it again later the same way.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Screen>
    );
  }

  return (
    <Screen
      title="Enter the code"
      subtitle={`Sent to ${trimmed}.`}
      back
      onBack={() => setStep('address')}
      footer={
        <>
          <PrimaryButton
            label="Save email address"
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
        The newest code is the only one that works, so wait for the resend timer rather than asking
        for another straight away.
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
