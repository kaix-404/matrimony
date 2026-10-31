import { useCallback, useEffect, useRef, useState } from 'react';
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

type Step = 'phone' | 'code';
type Purpose = 'LOGIN' | 'REGISTRATION';

/** Digits only, so a pasted "+91 98765 43210" is normalised the same way the API does. */
function normalizeMobile(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

/**
 * Sign-in and sign-up.
 *
 * Section 6 identifies a user by mobile number alone, so there is one entry
 * point with no email or password. The number's existence is deliberately not
 * knowable before a code is verified (requesting an OTP answers identically
 * either way), so the app asks for a `LOGIN` code and, only when the account
 * turns out not to exist, transparently requests a `REGISTRATION` code and
 * routes to the band picker. The user experiences a single "enter your number,
 * enter the code" flow regardless of which side they are on.
 */
export default function AuthScreen() {
  const { signIn } = useAuth();

  const [step, setStep] = useState<Step>('phone');
  const [purpose, setPurpose] = useState<Purpose>('LOGIN');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [deliveryWarning, setDeliveryWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const normalized = normalizeMobile(mobile);
  const canRequest = /^[6-9]\d{9}$/.test(normalized);

  const requestRef = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendCode = useCallback(async (nextPurpose: Purpose) => {
    if (requestRef.current) return;
    requestRef.current = true;
    setBusy(true);
    setError(null);
    setDeliveryWarning(null);
    try {
      const response = await apiClient.requestOtp({ mobile: normalized, purpose: nextPurpose });
      setPurpose(nextPurpose);
      setDevCode(response.dev_code ?? null);
      setDeliveryWarning(response.delivery_warning ?? null);
      setResendIn(response.resend_after_seconds);
      setStep('code');
      setCode('');
    } catch (e) {
      setError(describeOtpSendFailure(e));
    } finally {
      setBusy(false);
      requestRef.current = false;
    }
  }, [normalized]);

  const verify = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await apiClient.verifyOtp({ mobile: normalized, purpose, code });
      if (!response.verified) {
        setError('That code is incorrect or has expired.');
        return;
      }

      if (response.tokens) {
        await signIn(response.tokens);
        router.replace('/');
        return;
      }

      if (response.registration_required) {
        router.push({ pathname: '/register', params: { mobile: normalized } });
        return;
      }

      // Verified, but no session: the number has no account. A `LOGIN` code was
      // spent to learn that, so a fresh `REGISTRATION` code is issued now and the
      // user simply enters another one — no separate "create account?" step.
      if (purpose === 'LOGIN') {
        setNotice('This number is new — we sent a registration code.');
        await sendCode('REGISTRATION');
        return;
      }

      setError('We could not sign you in. Please try again.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }, [code, normalized, purpose, sendCode, signIn]);

  const isCodeStep = step === 'code';

  return (
    <Screen
      title={isCodeStep ? 'Enter the code' : 'Sign in'}
      subtitle={
        isCodeStep
          ? `Sent to +91 ${normalized}`
          : 'We will text you a one-time code. No password needed.'
      }
      back={isCodeStep}
      onBack={() => {
        setStep('phone');
        setCode('');
        setDeliveryWarning(null);
        setError(null);
        setNotice(null);
      }}
      footer={
        <PrimaryButton
          label={isCodeStep ? 'Verify' : 'Send code'}
          onPress={isCodeStep ? verify : () => sendCode('LOGIN')}
          disabled={isCodeStep ? code.length !== OTP_CODE_LENGTH : !canRequest}
          loading={busy}
        />
      }
    >
      {isCodeStep ? (
        <>
          <TextField
            label="Code"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH))}
            placeholder={'0'.repeat(OTP_CODE_LENGTH)}
            keyboardType="number-pad"
            maxLength={OTP_CODE_LENGTH}
            autoFocus
            error={error}
          />
          {deliveryWarning ? (
            <Text style={styles.warning}>{deliveryWarning}</Text>
          ) : null}
          {devCode ? (
            <Text style={styles.devHint}>Development code: {devCode}</Text>
          ) : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <PrimaryButton
            label={resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            variant="outline"
            disabled={resendIn > 0}
            loading={busy}
            onPress={() => sendCode(purpose)}
          />
        </>
      ) : (
        <>
          <TextField
            label="Mobile number"
            value={mobile}
            onChangeText={(value) => setMobile(normalizeMobile(value))}
            placeholder="98765 43210"
            keyboardType="number-pad"
            maxLength={10}
            autoFocus
            error={mobile.length > 0 && !canRequest ? 'Enter a 10-digit mobile number' : error}
          />
          <Text style={styles.terms}>
            By continuing you agree to be contacted about your account.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  warning: {
    color: colors.primary,
    ...typography.body,
  },
  devHint: {
    color: colors.textMuted,
    ...typography.caption,
  },
  notice: {
    color: colors.primaryDeep,
    ...typography.body,
  },
  terms: {
    color: colors.textMuted,
    ...typography.caption,
    paddingTop: spacing.sm,
  },
});
