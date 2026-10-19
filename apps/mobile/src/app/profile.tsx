import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { MyProfile, NetWorthCategoryOption, ProfileCompleteness } from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, radii, spacing, typography } from '../theme/tokens';

const FIELD_LABELS: Record<string, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  gender: 'Gender',
  date_of_birth: 'Date of birth',
  religion: 'Religion',
  mother_tongue: 'Mother tongue',
  education: 'Education',
  profession: 'Profession',
  city: 'City',
};

function label(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ');
}

/**
 * The member's own profile.
 *
 * `GET /profile` returns `404` until onboarding has run, which is a normal
 * state rather than an error — the screen offers the missing step instead of a
 * retry. Refetched on focus so a value saved on another screen is reflected
 * without a manual pull.
 */
export default function ProfileScreen() {
  const { ready } = useRequireAuth();
  const { token, user, signOut } = useAuth();

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [completeness, setCompleteness] = useState<ProfileCompleteness | null>(null);
  const [bandLabel, setBandLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notCreated, setNotCreated] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const [own, category] = await Promise.all([
        apiClient.getMyProfile(token),
        apiClient.getNetWorthCategories().catch((): NetWorthCategoryOption[] => []),
      ]);
      const done = await apiClient.getProfileCompleteness(token);
      setProfile(own);
      setCompleteness(done);
      setBandLabel(
        category.find((option) => option.key === own.networth_category)?.label ??
          own.networth_category,
      );
      setNotCreated(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.startsWith('API 404')) {
        setNotCreated(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (ready) void load();
    }, [ready, load]),
  );

  useEffect(() => {
    if (!ready) setLoading(false);
  }, [ready]);

  if (!ready || loading) {
    return (
      <Screen title="Profile" bottomNav>
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (notCreated) {
    return (
      <Screen title="Profile" subtitle="A few details are still missing." bottomNav>
        <View style={styles.card}>
          <Ionicons name="person-add-outline" size={28} color={colors.primary} />
          <Text style={styles.cardTitle}>Finish setting up your profile</Text>
          <Text style={styles.cardBody}>
            Add your name, gender and date of birth to be discoverable.
          </Text>
        </View>
        <PrimaryButton label="Add my details" onPress={() => router.push('/onboarding')} />
        <PrimaryButton
          variant="outline"
          label="Sign out"
          onPress={() => {
            void signOut().then(() => router.replace('/'));
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen title="Profile" subtitle={user?.mobile ? `+91 ${user.mobile}` : undefined} bottomNav>
      <View style={styles.card}>
        <Text style={styles.name}>
          {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}
        </Text>
        {bandLabel ? <Text style={styles.band}>{bandLabel}</Text> : null}
        <View style={styles.metaRow}>
          <Ionicons
            name={profile?.visibility === 'ACTIVE' ? 'eye-outline' : 'eye-off-outline'}
            size={16}
            color={colors.textMuted}
          />
          <Text style={styles.meta}>
            {profile?.visibility === 'ACTIVE' ? 'Visible to your selected bands' : profile?.visibility}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Profile checklist</Text>
        {completeness?.is_complete ? (
          <View style={styles.doneRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
            <Text style={styles.meta}>Everything required is in place.</Text>
          </View>
        ) : (
          (completeness?.missing_fields ?? []).map((field) => (
            <View key={field} style={styles.missingRow}>
              <Ionicons name="ellipse-outline" size={16} color={colors.textMuted} />
              <Text style={styles.meta}>{label(field)}</Text>
            </View>
          ))
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton
        variant="outline"
        label="Settings & privacy"
        onPress={() => router.push('/settings')}
      />
      <PrimaryButton
        variant="outline"
        label="Sign out"
        onPress={() => {
          void signOut().then(() => router.replace('/'));
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  card: {
    padding: spacing.lg,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  cardBody: {
    color: colors.textMuted,
    ...typography.caption,
  },
  name: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  band: {
    color: colors.primaryDeep,
    ...typography.body,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.title,
    marginBottom: spacing.xs,
  },
  meta: {
    color: colors.textMuted,
    ...typography.caption,
  },
  error: {
    color: colors.primary,
    ...typography.caption,
  },
});
