import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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
 * The two net-worth visibility lists.
 *
 * Moved out of Settings when the client narrowed that screen to account and
 * privacy actions — but it still has to be reachable, because these lists decide
 * who appears in the feed in both directions.
 *
 * The lists are saved as sets: the API treats an empty list as a deliberate
 * "nobody", so the checkboxes are the literal representation of that choice
 * rather than a filter over it. Devices are shown read-only: the push token is a
 * device secret the API never returns, and a device is removed when it signs out.
 */
export default function DiscoverySettingsScreen() {
  const { ready } = useRequireAuth();
  const { token } = useAuth();

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
      // A member who never saved effectively sees, and is seen by, their own
      // band. Rendering that as the starting selection keeps saving idempotent.
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

  const changed = !sameSet(discover, pristine.discover) || !sameSet(visibleTo, pristine.visibleTo);

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
      <Screen title="Discovery & visibility" back>
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Discovery & visibility"
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
              <Text style={styles.deviceMeta}>
                Last active {formatDate(String(device.last_seen_at))}
              </Text>
            </View>
          ))
        )}
      </View>
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
