import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NotificationResponse } from '@matrimony/shared';
import { AppShell } from '../components/AppShell';
import { BottomNav } from '../components/BottomNav';
import { ScreenHeader } from '../components/ScreenHeader';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, radii, spacing, typography } from '../theme/tokens';

function formatWhen(value: unknown): string {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

/**
 * The in-app notification inbox.
 *
 * Section 42 also delivers these over push, but a notification that was only
 * ever pushed is lost if the device was offline or the permission was denied,
 * so the row is stored server-side and listed here. Paged with the API's opaque
 * cursor.
 */
export default function NotificationsScreen() {
  const { ready } = useRequireAuth();
  const { token } = useAuth();

  const [items, setItems] = useState<NotificationResponse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (pageCursor: string | null, replace: boolean) => {
      if (!token) return;
      try {
        const response = await apiClient.listNotifications(token, {
          limit: 20,
          cursor: pageCursor ?? undefined,
        });
        setItems((prev) => (replace ? response.notifications : [...prev, ...response.notifications]));
        setCursor(response.nextCursor);
        setHasMore(response.hasMore);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load notifications.');
      }
    },
    [token],
  );

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    void fetchPage(null, true).finally(() => setLoading(false));
  }, [ready, fetchPage]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setError(null);
    void fetchPage(null, true).finally(() => setRefreshing(false));
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || cursor === null || loadingMore) return;
    setLoadingMore(true);
    void fetchPage(cursor, false).finally(() => setLoadingMore(false));
  }, [cursor, fetchPage, hasMore, loadingMore]);

  return (
    <AppShell>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={<ScreenHeader title="Messages" subtitle="Updates about your account." />}
        ListEmptyComponent={
          <View style={styles.state}>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.stateText}>Nothing here yet.</Text>
            )}
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {error !== null ? <Text style={styles.error}>{error}</Text> : null}
            {loadingMore ? <ActivityIndicator color={colors.primary} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="notifications-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.texts}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.meta}>{formatWhen(item.createdAt)}</Text>
            </View>
          </View>
        )}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
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
    gap: spacing.md,
    marginHorizontal: spacing.screenX,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.circle,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    ...typography.title,
  },
  body: {
    color: colors.textStrong,
    ...typography.body,
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
  footer: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  error: {
    color: colors.textMuted,
    ...typography.caption,
    paddingHorizontal: spacing.screenX,
    textAlign: 'center',
  },
});
