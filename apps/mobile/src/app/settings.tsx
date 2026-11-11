import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { MyProfile } from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, radii, spacing, typography } from '../theme/tokens';

/**
 * Settings, organised around the two things a member comes here to do: leave, or
 * be less visible.
 *
 * The client narrowed this screen to account and privacy actions, so the net-worth
 * visibility lists moved to Discovery & visibility, and the product extras —
 * partner preferences, pricing, help — sit in their own group at the bottom
 * rather than being deleted. Pausing lives here as a switch because it is the
 * reversible version of deleting an account, and putting it next to the
 * irreversible one is how a member finds it before they delete anything.
 *
 * The mobile number is changed through a verified swap (a code to the new number,
 * then every other session revoked) rather than a text field, because it is the
 * login identity. An email is added the same way, but it revokes nothing: it is
 * not a way to sign in, so losing a mailbox must not sign a member out of the app
 * they are already using.
 */
export default function SettingsScreen() {
  const { ready } = useRequireAuth();
  const { token, user, signOut } = useAuth();

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setProfile(await apiClient.getMyProfile(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Re-read on focus: the toggle is also on the profile screen, so returning from
  // there must not leave this switch showing the state it had before.
  useFocusEffect(
    useCallback(() => {
      if (ready) void load();
    }, [ready, load]),
  );

  const paused = profile?.visibility === 'PAUSED';

  async function setPaused(next: boolean) {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiClient.setProfileVisibility(next ? 'PAUSED' : 'ACTIVE', token);
      setProfile(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change your visibility.');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) {
    return (
      <Screen title="Settings & privacy" back>
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Settings & privacy" subtitle="Your account, and who can see it." back>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy</Text>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Pause my profile</Text>
            <Text style={styles.rowHint}>
              Hidden from everyone until you turn this back on. Nothing is deleted, and unlocks you
              bought stay valid for their window.
            </Text>
          </View>
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Switch
              value={!paused}
              onValueChange={(visible) => void setPaused(!visible)}
              disabled={saving || profile === null}
              trackColor={{ false: colors.hairline, true: colors.primary }}
              thumbColor={colors.white}
            />
          )}
        </View>
        <PrimaryButton
          variant="outline"
          label="Discovery & visibility"
          onPress={() => router.push('/discovery-settings')}
        />
        <PrimaryButton
          variant="outline"
          label="Blocked profiles"
          onPress={() => router.push('/blocks')}
        />
        <PrimaryButton
          variant="outline"
          label="Request a copy of your data"
          onPress={() => router.push('/data-request')}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <PrimaryButton
          variant="outline"
          label="Change mobile number"
          onPress={() => router.push('/change-mobile')}
        />
        <PrimaryButton
          variant="outline"
          label="Add or change email"
          onPress={() => router.push('/change-email')}
        />
        {user === null ? null : (
          <Text style={styles.hint}>
            {user.email === null ? 'No email on file yet.' : `On file: ${user.email}`}
          </Text>
        )}
        <PrimaryButton
          variant="outline"
          label="Identity verification"
          onPress={() => router.push('/verification')}
        />
        <PrimaryButton
          variant="outline"
          label="Delete account"
          onPress={() => router.push('/delete-account')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>More</Text>
        <PrimaryButton
          variant="outline"
          label="Partner preferences"
          onPress={() => router.push('/partner-preferences')}
        />
        <PrimaryButton variant="outline" label="Pricing" onPress={() => router.push('/pricing')} />
        <PrimaryButton variant="outline" label="Help" onPress={() => router.push('/help')} />
      </View>

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
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.input,
    padding: spacing.lg,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  rowHint: {
    color: colors.textMuted,
    ...typography.caption,
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
