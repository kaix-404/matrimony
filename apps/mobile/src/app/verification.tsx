import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Linking from 'expo-linking';
import type { VerificationStatusResponse } from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, radii, spacing, typography } from '../theme/tokens';

/**
 * Identity verification (D9).
 *
 * The DigiLocker journey happens in the browser — Cashfree's consent URL is a
 * one-time page, not something we can render — so this screen has two jobs: it
 * starts an attempt, and it re-reads the verdict when the user comes back. The
 * verdict itself is never assumed here: only the vendor's signed webhook can
 * mark a check passed, and this screen finds out by asking.
 *
 * Consent is explicit and comes before the browser opens: tapping the button
 * records Aadhaar-processing consent and then launches the page, which is the
 * ordering the DPDP rules require.
 */
export default function VerificationScreen() {
  const { ready } = useRequireAuth();
  const { token, user, refreshUser } = useAuth();

  const [state, setState] = useState<VerificationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setState(await apiClient.getVerificationStatus(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read your verification status.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Re-read on focus rather than only on mount: the user leaves for the
  // browser and returns to a screen that was never unmounted, so a mount-only
  // read would keep showing "pending" after the check had already passed.
  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      void load();
    }, [ready, load]),
  );

  const start = useCallback(async () => {
    if (!token) return;
    setStarting(true);
    setError(null);
    try {
      const next = await apiClient.startVerification(token);
      setState(next);
      if (next.redirect_url) {
        await Linking.openURL(next.redirect_url);
      } else {
        setError('The verification link could not be created. Please try again.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start verification.');
    } finally {
      setStarting(false);
    }
  }, [token]);

  /** The account moved on once the webhook landed, so refresh what gates use. */
  const finish = useCallback(async () => {
    await refreshUser();
    router.replace(user?.status === 'AWAITING_SETUP_FEE' ? '/setup-fee' : '/');
  }, [refreshUser, user?.status]);

  if (!ready || loading) {
    return (
      <Screen title="Identity verification" back>
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const status = state?.status ?? 'NOT_STARTED';
  const verified = status === 'VERIFIED';
  // A PENDING row only moves when the vendor's webhook arrives. Once the
  // attempt's session has lapsed no webhook can complete it, so "waiting"
  // would strand the member on a check that will never finish.
  const linkExpired =
    status === 'PENDING' &&
    state?.providerReferenceExpiresAt !== null &&
    state?.providerReferenceExpiresAt !== undefined &&
    new Date(state.providerReferenceExpiresAt).getTime() <= Date.now();

  return (
    <Screen
      title="Identity verification"
      subtitle="Required before your profile can be seen or you can browse."
      back
      footer={
        verified ? (
          <PrimaryButton
            label={user?.status === 'AWAITING_SETUP_FEE' ? 'Continue to setup fee' : 'Done'}
            onPress={() => void finish()}
          />
        ) : (
          <>
            <PrimaryButton
              label={
                linkExpired
                  ? 'Get a new link'
                  : status === 'PENDING'
                    ? 'Reopen DigiLocker'
                    : 'Verify with DigiLocker'
              }
              onPress={() => void start()}
              loading={starting}
            />
            <PrimaryButton variant="outline" label="Check status" onPress={() => void load()} />
          </>
        )
      }
    >
      {verified ? (
        <>
          <Text style={styles.lead}>
            Your identity has been verified. Only a masked Aadhaar reference is kept — we never
            store your Aadhaar number.
          </Text>
          <View style={styles.card}>
            {state?.nameOnId ? <Row label="Name on ID" value={state.nameOnId} /> : null}
            {state?.yearOfBirth ? (
              <Row label="Year of birth" value={String(state.yearOfBirth)} />
            ) : null}
            {state?.aadhaarLast4 ? <Row label="Aadhaar" value={`XXXX XXXX ${state.aadhaarLast4}`} /> : null}
            {state?.verifiedAt ? (
              <Row label="Verified on" value={new Date(state.verifiedAt).toLocaleDateString()} />
            ) : null}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.lead}>
            As per Government of India norms, please complete KYC verification for Aadhaar. You will
            be taken to DigiLocker to sign in and share your Aadhaar details, so that the person
            behind a profile is real.
          </Text>
          <Text style={styles.note}>
            Your profile will be offline until KYC is completed.
          </Text>

          {linkExpired ? (
            <Text style={styles.error}>
              That DigiLocker link expired before the check was completed. Request a new one to
              finish verifying.
            </Text>
          ) : status === 'PENDING' ? (
            <Text style={styles.note}>
              Waiting for DigiLocker. Finish the steps in the browser, then tap “Check status”.
            </Text>
          ) : null}

          {status === 'FAILED' ? (
            <Text style={styles.error}>
              The check could not be completed
              {state?.failureReason ? ` (${state.failureReason.toLowerCase().replace(/_/g, ' ')})` : ''}.
              You can try again.
            </Text>
          ) : null}

          {status === 'EXPIRED' ? (
            <Text style={styles.error}>
              The verification link expired before it was completed. Start again to get a new one.
            </Text>
          ) : null}

          <Text style={styles.note}>
            By continuing you consent to your Aadhaar details being processed for identity
            verification. No Aadhaar number or document copy is stored — only a masked reference,
            the name and year of birth that appear on the ID.
          </Text>
        </>
      )}

      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  lead: {
    color: colors.textMuted,
    ...typography.body,
  },
  card: {
    padding: spacing.lg,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  rowLabel: {
    color: colors.textMuted,
    ...typography.body,
  },
  rowValue: {
    color: colors.textPrimary,
    ...typography.body,
  },
  note: {
    color: colors.textMuted,
    ...typography.caption,
  },
  error: {
    color: colors.primary,
    ...typography.body,
  },
});
