import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { FullProfile, PreviewPhoto } from '@matrimony/shared';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { apiClient, type ViewedProfile } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { useRequireAuth } from '../../lib/use-require-auth';
import { colors, radii, spacing, typography } from '../../theme/tokens';

/** Labels for the unlocked profile's field grid. */
const FULL_PROFILE_FIELDS: Array<[keyof FullProfile, string]> = [
  ['age', 'Age'],
  ['date_of_birth', 'Date of birth'],
  ['height_cm', 'Height (cm)'],
  ['religion', 'Religion'],
  ['community', 'Community'],
  ['mother_tongue', 'Mother tongue'],
  ['education', 'Education'],
  ['profession', 'Profession'],
  ['city', 'City'],
  ['about_me', 'About'],
];

/**
 * Another member's profile, at the level the caller has earned.
 *
 * The API returns one of three shapes and the screen renders each without ever
 * assuming a locked field exists: a locked preview (photos, religion, date of
 * birth, age and the price), an expired unlock (the same, plus a re-unlock
 * prompt) or the full profile with contact. Section 13's hidden fields are
 * absent from the locked payload, so there is nothing for the UI to blur.
 */
export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useRequireAuth();
  const { token } = useAuth();

  const [profile, setProfile] = useState<ViewedProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setError(null);
    try {
      setProfile(await apiClient.viewProfile(id, token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this profile.');
    }
  }, [token, id]);

  // Reloads on focus so returning from checkout shows the freshly unlocked
  // contact without the user pulling to refresh.
  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [ready, load]),
  );

  /** Open a Razorpay order for this member, then hand off to the checkout screen. */
  const startUnlock = useCallback(async () => {
    if (!token || !id) return;
    setUnlocking(true);
    setError(null);
    try {
      const order = await apiClient.createUnlockOrder(id, token);
      router.push({
        pathname: '/checkout',
        params: {
          payment_id: order.payment_id,
          order_id: order.gateway_order_id,
          key_id: order.key_id,
          amount_minor: String(Math.round(Number(order.amount.total_amount) * 100)),
          // The name is hidden before payment, so it is only known when the
          // caller is re-purchasing an expired unlock.
          name: profile && !profile.profile_locked ? profile.full_profile.first_name : '',
          profile_id: id,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the payment.');
    } finally {
      setUnlocking(false);
    }
  }, [token, id, profile]);

  if (!ready || loading) {
    return (
      <Screen title="Profile" back>
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error !== null || profile === null) {
    return (
      <Screen title="Profile" back>
        <Text style={styles.error}>{error ?? 'Profile unavailable.'}</Text>
      </Screen>
    );
  }

  const locked = profile.profile_locked;

  return (
    <Screen title={locked ? 'Preview' : profile.full_profile.first_name} back>
      <PhotoStrip photos={profile.photos} />

      {locked ? (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Visible now</Text>
            <Detail label="Religion" value={profile.religion} />
            <Detail label="Date of birth" value={profile.date_of_birth} />
            <Detail label="Age" value={profile.age === null ? null : String(profile.age)} />
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Locked until you unlock</Text>
            <Text style={styles.lockedText}>
              Name, contact details, education, profession and family details are shown after
              payment.
            </Text>
            <Text style={styles.price}>
              Unlock for {profile.unlock_price.currency} {profile.unlock_price.total_amount}
            </Text>
          </View>
        </>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Profile</Text>
            {FULL_PROFILE_FIELDS.map(([key, label]) => (
              <Detail key={key} label={label} value={fullValue(profile.full_profile[key])} />
            ))}
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Contact</Text>
            <Text style={styles.contact}>
              {profile.contact.is_available
                ? `+91 ${profile.contact.mobile}`
                : (profile.contact.hidden_reason ?? 'Not available')}
            </Text>
          </View>
        </>
      )}

      {locked && token ? (
        <>
          <PrimaryButton
            label="Unlock contact"
            onPress={() => void startUnlock()}
            loading={unlocking}
          />
          {error !== null ? <Text style={styles.error}>{error}</Text> : null}
        </>
      ) : null}
    </Screen>
  );
}

/** The unlocked profile mixes strings, numbers and nulls; normalise for display. */
function fullValue(value: FullProfile[keyof FullProfile]): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (value === null || value === '') return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

/** Approved photos only; none are ever hidden behind payment (section 9). */
function PhotoStrip({ photos }: { photos: PreviewPhoto[] }) {
  if (photos.length === 0) {
    return (
      <View style={[styles.photo, styles.photoPlaceholder]}>
        <Ionicons name="image-outline" size={36} color={colors.textMuted} />
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.photoStrip}
    >
      {photos.map((photo) => (
        <Image key={photo.photo_id} source={{ uri: photo.url }} style={styles.photo} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  photoStrip: {
    gap: spacing.md,
  },
  photo: {
    width: 260,
    height: 320,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    padding: spacing.lg,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  detailLabel: {
    color: colors.textMuted,
    ...typography.body,
  },
  detailValue: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  lockedText: {
    color: colors.textMuted,
    ...typography.caption,
  },
  price: {
    color: colors.primaryDeep,
    ...typography.title,
  },
  contact: {
    color: colors.textPrimary,
    ...typography.title,
  },
  error: {
    color: colors.primary,
    ...typography.body,
  },
});
