import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { UnlockSummary } from '@matrimony/shared';
import { AppShell } from '../components/AppShell';
import { BottomNav } from '../components/BottomNav';
import { ScreenHeader } from '../components/ScreenHeader';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, radii, spacing, typography } from '../theme/tokens';

/** Human-readable time left, e.g. "3d 4h left" or "Expired". */
function remainingLabel(item: UnlockSummary): string {
  if (item.status !== 'ACTIVE') return item.status === 'REVOKED' ? 'Revoked' : 'Expired';
  const hours = Math.floor(item.remaining_ms / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ${hours % 24}h left`;
  if (hours >= 1) return `${hours}h left`;
  return 'Less than an hour left';
}

/**
 * Section 15's "access remaining" surface.
 *
 * Names are only present while a window is open — the API nulls `display_name`
 * once an unlock expires, so the list stops re-disclosing the identity it was
 * paid to reveal. The countdown comes from the server's `remaining_ms`, never a
 * client clock, so a device with a wrong time cannot show access that the
 * server would refuse.
 */
export default function UnlocksScreen() {
  const { ready } = useRequireAuth();
  const { token } = useAuth();

  const [items, setItems] = useState<UnlockSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const response = await apiClient.listUnlocks(token);
      setItems(response.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your unlocks.');
    }
  }, [token]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [ready, load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  return (
    <AppShell>
      <FlatList
        data={items}
        keyExtractor={(item) => item.profile_id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <ScreenHeader title="Matches" subtitle="Profiles you have unlocked." />
        }
        ListEmptyComponent={
          <View style={styles.state}>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.stateText}>You have not unlocked anyone yet.</Text>
            )}
          </View>
        }
        ListFooterComponent={
          error !== null ? (
            <View style={styles.footer}>
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : undefined
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons
                name={item.status === 'ACTIVE' ? 'lock-open-outline' : 'lock-closed-outline'}
                size={20}
                color={item.status === 'ACTIVE' ? colors.primary : colors.textMuted}
              />
            </View>
            <View style={styles.texts}>
              <Text style={styles.name}>{item.display_name ?? 'Unlocked profile'}</Text>
              <Text style={styles.meta}>{remainingLabel(item)}</Text>
            </View>
          </View>
        )}
      />
      <BottomNav />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.navClearance,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.screenX,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.circle,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.textPrimary,
    ...typography.title,
  },
  meta: {
    color: colors.textMuted,
    ...typography.caption,
  },
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  stateText: {
    color: colors.textMuted,
    ...typography.body,
  },
  error: {
    color: colors.textMuted,
    ...typography.caption,
    textAlign: 'center',
    paddingHorizontal: spacing.screenX,
  },
  footer: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
});
