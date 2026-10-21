import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ACCOUNT_SETUP_FEE, GST_PERCENT, quotePayment } from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, radii, spacing, typography } from '../theme/tokens';

/** The flat platform fee, priced the same way the API prices it (D9). */
const QUOTE = quotePayment(ACCOUNT_SETUP_FEE, GST_PERCENT);

/**
 * The one-time account setup fee (client answer D9).
 *
 * Shown only once identity verification has passed: the API refuses to open a
 * setup-fee order for any other status, so this screen exists for exactly the
 * accounts sitting in AWAITING_SETUP_FEE. Discovery withholds the feed until
 * the fee settles, which makes this the front door for that state.
 *
 * The amount is priced here for display only — the server prices the order, and
 * the gateway enforces the order's amount.
 */
export default function SetupFeeScreen() {
  const { ready } = useRequireAuth();
  const { token, refreshUser } = useAuth();

  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Open the setup-fee order, then hand off to the shared checkout screen. */
  const startPayment = useCallback(async () => {
    if (!token) return;
    setPaying(true);
    setError(null);
    try {
      const order = await apiClient.createSetupFeeOrder(token);
      router.push({
        pathname: '/checkout',
        params: {
          payment_id: order.payment_id,
          order_id: order.gateway_order_id,
          key_id: order.key_id,
          amount_minor: String(Math.round(Number(order.amount.total_amount) * 100)),
          purpose: 'SETUP_FEE',
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the payment.');
    } finally {
      setPaying(false);
    }
  }, [token]);

  // The fee may already have settled (webhook ran while the app was closed),
  // so re-read the account on focus instead of assuming the gate still holds.
  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      void refreshUser();
    }, [ready, refreshUser]),
  );

  return (
    <Screen title="Account setup fee" back>
      <Text style={styles.lead}>
        Your identity has been verified. Pay the one-time setup fee to activate your account and
        start browsing profiles.
      </Text>

      <View style={styles.card}>
        <Row label="Account setup fee" value={`₹ ${QUOTE.baseAmount}`} />
        <Row label={`GST (${GST_PERCENT}%)`} value={`₹ ${QUOTE.gstAmount}`} />
        <View style={styles.divider} />
        <Row label="Total" value={`₹ ${QUOTE.totalAmount}`} emphasise />
      </View>

      <Text style={styles.note}>This is a one-time charge. It is not a subscription.</Text>

      <PrimaryButton
        label={`Pay ₹ ${QUOTE.totalAmount}`}
        onPress={() => void startPayment()}
        loading={paying}
      />
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

function Row({ label, value, emphasise }: { label: string; value: string; emphasise?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, emphasise && styles.rowStrong]}>{label}</Text>
      <Text style={[styles.rowValue, emphasise && styles.rowStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  rowStrong: {
    color: colors.textPrimary,
    ...typography.title,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
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
