import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { MatchCard } from '@matrimony/shared';
import { AppShell } from '../components/AppShell';
import { BottomNav } from '../components/BottomNav';
import { ScreenHeader } from '../components/ScreenHeader';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { shareProfile } from '../lib/share-profile';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, radii, spacing, typography } from '../theme/tokens';

/** Human-readable access left, from the server's `remaining_ms`. */
function accessLabel(item: MatchCard): string | null {
  if (item.unlock_status === 'EXPIRED') return 'Unlock expired — unlock again to see contact';
  if (item.unlock_status === 'REVOKED') return 'Unlock revoked';
  if (item.unlock_status !== 'ACTIVE') return null;

  const remaining = item.remaining_ms ?? 0;
  const hours = Math.floor(remaining / 3_600_000);
  const days = Math.floor(hours / 24);
  const left =
    days >= 1
      ? `${days}d ${hours % 24}h left`
      : hours >= 1
        ? `${hours}h left`
        : 'Less than an hour left';
  return `Unlocked · ${left}`;
}

/**
 * The Matches tab: everything this member has decided to keep.
 *
 * Two things put a profile here, and they are not the same thing. An unlock is a
 * purchase with a 24-hour window; a shortlist is a free bookmark that never
 * expires. Both appear, so a member has one place to return to, but the row says
 * which one it is: the name is only present while an unlock is open (the server
 * nulls it otherwise), and a bookmarked profile keeps the anonymous card the
 * feed showed, because section 13 withholds the name until payment.
 *
 * Countdowns come from the server's `remaining_ms`, so a device with a wrong
 * clock cannot show access the API would refuse.
 */
export default function MatchesScreen() {
  const { ready } = useRequireAuth();
  const { token } = useAuth();

  const [items, setItems] = useState<MatchCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const response = await apiClient.getMatches(token);
      setItems(response.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your matches.');
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

  /**
   * Toggles the bookmark from the row itself.
   *
   * It is a toggle, not a remove: an unlocked profile that was never bookmarked
   * arrives here with an outline bookmark, and the icon has to mean what it
   * shows — tapping it adds. The previous version always deleted, so on those
   * rows it asked the server to remove a row that did not exist and the icon
   * never filled in.
   *
   * Only the bookmark is touched. An unlock is a payment record with an expiry,
   * so "removing" it would either lie about what happened or hide a purchase the
   * member may want the receipt of — it leaves the list when its window closes.
   */
  const toggle = useCallback(
    async (item: MatchCard) => {
      if (!token) return;
      setBusyId(item.profile_id);
      setError(null);
      try {
        if (item.is_shortlisted) {
          await apiClient.removeFromShortlist(item.profile_id, token);
        } else {
          await apiClient.addToShortlist(item.profile_id, token);
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update your shortlist.');
      } finally {
        setBusyId(null);
      }
    },
    [token, load],
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
          <ScreenHeader
            title="Matches"
            subtitle="Profiles you unlocked or shortlisted."
          />
        }
        ListEmptyComponent={
          <View style={styles.state}>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text style={styles.stateText}>Nothing saved yet.</Text>
                <Text style={styles.stateHint}>
                  Shortlist a profile from its page to keep it here, or unlock one to see its
                  contact details.
                </Text>
              </>
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
        renderItem={({ item }) => {
          const access = accessLabel(item);
          const title = item.display_name ?? 'Shortlisted profile';
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${title}`}
              style={styles.card}
              onPress={() => router.push({ pathname: '/member/[id]', params: { id: item.profile_id } })}
            >
              {item.photo ? (
                <Image source={{ uri: item.photo.url }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoEmpty]}>
                  <Ionicons name="person-outline" size={22} color={colors.textMuted} />
                </View>
              )}

              <View style={styles.texts}>
                <Text style={styles.name} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.meta} numberOfLines={2}>
                  {access ?? 'Shortlisted'}
                </Text>
              </View>

              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.is_shortlisted ? 'Remove from shortlist' : 'Shortlist'}
                  hitSlop={8}
                  disabled={busyId === item.profile_id}
                  onPress={() => void toggle(item)}
                >
                  <Ionicons
                    name={item.is_shortlisted ? 'bookmark' : 'bookmark-outline'}
                    size={20}
                    color={item.is_shortlisted ? colors.primary : colors.textMuted}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Share profile"
                  hitSlop={8}
                  onPress={() =>
                    void shareProfile({ profileId: item.profile_id, name: item.display_name })
                  }
                >
                  <Ionicons name="share-outline" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            </Pressable>
          );
        }}
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
    padding: spacing.md,
    borderRadius: radii.cardMd,
    backgroundColor: colors.surface,
  },
  photo: {
    width: 52,
    height: 52,
    borderRadius: radii.circle,
    backgroundColor: colors.surfaceAlt,
  },
  photoEmpty: {
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  state: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.screenX,
    alignItems: 'center',
    gap: spacing.sm,
  },
  stateText: {
    color: colors.textPrimary,
    ...typography.title,
  },
  stateHint: {
    color: colors.textMuted,
    ...typography.caption,
    textAlign: 'center',
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
