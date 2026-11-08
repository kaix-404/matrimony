import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { BlockedProfile } from '@matrimony/shared';
import { AppShell } from '../components/AppShell';
import { BottomNav } from '../components/BottomNav';
import { ScreenHeader } from '../components/ScreenHeader';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, radii, spacing, typography } from '../theme/tokens';

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

/**
 * The blocked profiles, and the way back (section 19).
 *
 * A block is two-way: neither member appears in the other's feed or unlocks, so
 * this screen is the only place a block can be undone. It shows the photo the
 * caller picked the profile out of the feed by, never a name - blocking never
 * bought the identity, so it must not reveal what a payment would have.
 *
 * Unblocking asks first. It is one tap in a list of people someone chose to
 * remove, and the button sits where a scroll can land on it.
 */
export default function BlocksScreen() {
  const { ready } = useRequireAuth();
  const { token } = useAuth();

  const [items, setItems] = useState<BlockedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const response = await apiClient.listBlocks(token);
      setItems(response.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your blocked profiles.');
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

  const unblock = useCallback(
    async (profileId: string) => {
      if (!token) return;
      setBusyId(profileId);
      setError(null);
      try {
        await apiClient.unblockProfile(profileId, token);
        // Removed from the list only after the API agreed, so the row cannot
        // disappear on a request that failed.
        setItems((current) => current.filter((item) => item.profile_id !== profileId));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not unblock that profile.');
      } finally {
        setBusyId(null);
      }
    },
    [token],
  );

  const confirmUnblock = useCallback(
    (item: BlockedProfile) => {
      Alert.alert(
        'Unblock this profile?',
        'They can appear in your feed again, and you in theirs.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unblock',
            style: 'destructive',
            onPress: () => {
              void unblock(item.profile_id);
            },
          },
        ],
      );
    },
    [unblock],
  );

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
          <View>
            <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button">
              <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <ScreenHeader
              title="Blocked profiles"
              subtitle="Blocked profiles cannot see you, and you cannot see them."
            />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.state}>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.stateText}>You have not blocked anyone.</Text>
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
            {item.photo === null ? (
              <View style={styles.photoFallback}>
                <Ionicons name="person-outline" size={22} color={colors.textMuted} />
              </View>
            ) : (
              <Image source={{ uri: item.photo.url }} style={styles.photo} />
            )}
            <View style={styles.texts}>
              <Text style={styles.title}>Blocked profile</Text>
              <Text style={styles.meta}>Blocked {formatDate(item.blocked_at)}</Text>
            </View>
            <Pressable
              onPress={() => confirmUnblock(item)}
              disabled={busyId === item.profile_id}
              accessibilityRole="button"
              accessibilityLabel="Unblock this profile"
              style={styles.unblock}
            >
              {busyId === item.profile_id ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.unblockText}>Unblock</Text>
              )}
            </Pressable>
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
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginHorizontal: spacing.screenX,
    marginBottom: spacing.sm,
  },
  backText: {
    color: colors.textMuted,
    ...typography.body,
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
  photo: {
    width: 44,
    height: 44,
    borderRadius: radii.circle,
    backgroundColor: colors.background,
  },
  photoFallback: {
    width: 44,
    height: 44,
    borderRadius: radii.circle,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.textPrimary,
    ...typography.title,
  },
  meta: {
    color: colors.textMuted,
    ...typography.caption,
  },
  unblock: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  unblockText: {
    color: colors.primary,
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
