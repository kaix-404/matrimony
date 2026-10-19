import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { DeviceTokenResponse, NetWorthCategoryOption } from '@matrimony/shared';
import { CheckboxList, type CheckboxOption } from '../components/CheckboxList';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, radii, spacing, typography } from '../theme/tokens';

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

/**
 * Settings and privacy.
 *
 * The two net-worth lists decide who this user can find and who can find them
 * (section 36). They are edited together here and saved as sets: the API treats
 * an empty list as a deliberate "nobody", so the checkboxes are the literal
 * representation of that choice rather than a filter over it.
 *
 * Devices are shown read-only. The push token is a device secret the API never
 * returns, so it cannot be named in a delete call from this list; a device is
 * removed when it signs out.
 */
export default function SettingsScreen() {
  const { ready } = useRequireAuth();
  const { token, signOut } = useAuth();

  const [categories, setCategories] = useState<NetWorthCategoryOption[]>([]);
  const [discover, setDiscover] = useState<string[]>([]);
  const [visibleTo, setVisibleTo] = useState<string[]>([]);
  const [pristine, setPristine] = useState<{ discover: string[]; visibleTo: string[] }>({
    discover: [],
    visibleTo: [],
  });
  const [devices, setDevices] = useState<DeviceTokenResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [bands, preference, deviceList] = await Promise.all([
        apiClient.getNetWorthCategories(),
        apiClient.getVisibilityPreference(token),
        apiClient.listDevices(token),
      ]);
      const discoverable = bands.filter((band) => band.is_discoverable);
      // A user who has never saved a preference effectively sees and is seen by
      // their own band; rendering that as the starting selection means saving is
      // idempotent for someone who changes nothing.
      const initialDiscover = preference.discovery_configured
        ? preference.discover
        : [preference.own_category];
      const initialVisibleTo = preference.visibility_configured
        ? preference.visible_to
        : [preference.own_category];
      setCategories(discoverable);
      setDiscover(initialDiscover);
      setVisibleTo(initialVisibleTo);
      setPristine({ discover: initialDiscover, visibleTo: initialVisibleTo });
      setDevices(deviceList.devices);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your settings.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const options: CheckboxOption[] = categories.map((band) => ({
    value: band.key,
    label: band.label,
  }));

  function toggle(list: string[], setList: (next: string[]) => void, value: string) {
    setSaved(false);
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  const changed =
    !sameSet(discover, pristine.discover) || !sameSet(visibleTo, pristine.visibleTo);

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const state = await apiClient.saveVisibilityPreference(
        { discover, visible_to: visibleTo },
        token,
      );
      setDiscover(state.discover);
      setVisibleTo(state.visible_to);
      setPristine({ discover: state.discover, visibleTo: state.visible_to });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your preferences.');
    } finally {
      setSaving(false);
    }
  }

  if (!ready || loading) {
    return (
      <Screen title="Settings" back>
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Settings & privacy"
      subtitle="Who you can find, and who can find you."
      back
      footer={
        <PrimaryButton
          label={saved && !changed ? 'Saved' : 'Save preferences'}
          onPress={save}
          disabled={!changed}
          loading={saving}
        />
      }
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bands I can discover</Text>
        <Text style={styles.sectionHint}>Profiles from these bands appear in your feed.</Text>
        <CheckboxList
          options={options}
          selected={discover}
          onToggle={(value) => toggle(discover, setDiscover, value)}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bands that can discover me</Text>
        <Text style={styles.sectionHint}>Only these bands see your profile in their feed.</Text>
        <CheckboxList
          options={options}
          selected={visibleTo}
          onToggle={(value) => toggle(visibleTo, setVisibleTo, value)}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Devices</Text>
        {devices.length === 0 ? (
          <Text style={styles.sectionHint}>No devices registered for notifications.</Text>
        ) : (
          devices.map((device) => (
            <View key={device.id} style={styles.deviceRow}>
              <Text style={styles.deviceName}>{device.platform}</Text>
              <Text style={styles.deviceMeta}>Last active {formatDate(String(device.last_seen_at))}</Text>
            </View>
          ))
        )}
      </View>

      <PrimaryButton
        variant="outline"
        label="Delete account"
        onPress={() => router.push('/delete-account')}
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

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((item) => set.has(item));
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
  sectionHint: {
    color: colors.textMuted,
    ...typography.caption,
  },
  deviceRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    gap: 2,
  },
  deviceName: {
    color: colors.textPrimary,
    ...typography.title,
  },
  deviceMeta: {
    color: colors.textMuted,
    ...typography.caption,
  },
  error: {
    color: colors.primary,
    ...typography.caption,
  },
});
