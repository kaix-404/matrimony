import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { PricingSchedule } from '@matrimony/shared';
import { Screen } from '../components/Screen';
import { apiClient } from '../lib/api-client';
import { colors, radii, spacing, typography } from '../theme/tokens';

/** "0.1800" → "18", so the GST line reads like a rate and not a fraction. */
function gstPercent(rate: string): string {
  const parsed = Number(rate);
  return Number.isFinite(parsed) ? String(Number((parsed * 100).toFixed(2))) : rate;
}

/**
 * What things cost.
 *
 * The numbers are read from the API, not written into the app: an admin changing
 * a price must not need a release, and a page advertising a price the checkout
 * will not charge is the kind of mismatch that ends in a refund. Prices include
 * GST in the headline figure, with the base and tax shown underneath, because
 * Indian price display is legally required to make the tax component visible.
 *
 * Reachable from Settings; no session is needed, since a price is not user data.
 */
export default function PricingScreen() {
  const [schedule, setSchedule] = useState<PricingSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await apiClient.getPricingSchedule();
        if (!cancelled) setSchedule(result);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load the price list.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Screen title="Pricing" subtitle="What you pay, and when." back>
      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error !== null ? (
        <Text style={styles.error}>{error}</Text>
      ) : schedule === null ? (
        <Text style={styles.hint}>The price list is not published yet.</Text>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Account setup</Text>
            <Text style={styles.amount}>₹ {schedule.setup_fee.total_amount}</Text>
            <Text style={styles.breakdown}>
              One time, when you activate your account. ₹ {schedule.setup_fee.base_amount} +{' '}
              {gstPercent(schedule.setup_fee.gst_rate)}% GST.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Unlocking a contact</Text>
          <Text style={styles.hint}>
            The price is set by the band of the profile you want to contact, not by your own. You pay
            only when you choose to unlock, and the contact stays open for 24 hours.
          </Text>

          {schedule.bands.map((band) =>
            band.unlock_price === null ? null : (
              <View key={band.key} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{band.label}</Text>
                  <Text style={styles.breakdown}>
                    ₹ {band.unlock_price.base_amount} + {gstPercent(band.unlock_price.gst_rate)}% GST
                  </Text>
                </View>
                <Text style={styles.rowAmount}>₹ {band.unlock_price.total_amount}</Text>
              </View>
            ),
          )}

          <Text style={styles.hint}>
            Prices include GST. Your profile’s band is chosen at registration and cannot be changed
            later.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.cardMd,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardTitle: {
    color: colors.textMuted,
    ...typography.caption,
  },
  amount: {
    color: colors.textPrimary,
    ...typography.h1,
  },
  breakdown: {
    color: colors.textMuted,
    ...typography.caption,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.h2,
    paddingTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.input,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowText: {
    flexShrink: 1,
    gap: 2,
  },
  rowLabel: {
    color: colors.textPrimary,
    ...typography.body,
  },
  rowAmount: {
    color: colors.textPrimary,
    ...typography.title,
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
