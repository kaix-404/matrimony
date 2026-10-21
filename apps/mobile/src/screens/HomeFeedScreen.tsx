import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppShell } from '../components/AppShell';
import { BottomNav } from '../components/BottomNav';
import { FeedCard } from '../components/FeedCard';
import { HeaderBar } from '../components/HeaderBar';
import { HeroSection, type HeroVariant } from '../components/HeroSection';
import { useAuth } from '../lib/auth-context';
import { useDiscoveryFeed } from '../lib/use-discovery-feed';
import { colors, radii, spacing, typography } from '../theme/tokens';

/**
 * Home screen: header, hero/search area, discovery feed, and floating nav.
 *
 * The feed reads the discovery API once a session exists (pull-to-refresh plus
 * cursor-based infinite scroll) and falls back to the placeholder design
 * content before sign-in, so the layout stays previewable on its own.
 */
export function HomeFeedScreen({ heroVariant = 1 }: { heroVariant?: HeroVariant }) {
  const { user } = useAuth();
  const { items, isLive, loading, refreshing, loadingMore, error, refresh, loadMore } =
    useDiscoveryFeed();

  // D9: discovery withholds the feed until the setup fee settles, so showing an
  // empty feed here would be a dead end. This state has one action: pay.
  if (user?.status === 'AWAITING_SETUP_FEE') {
    return (
      <AppShell>
        <View style={styles.gated}>
          <HeaderBar />
          <SetupFeeBanner />
        </View>
        <BottomNav />
      </AppShell>
    );
  }

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
        ListHeaderComponent={
          <View style={styles.header}>
            <HeaderBar />
            <HeroSection variant={heroVariant} />
            {!isLive && <SignInBanner />}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.state}>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.stateText}>No profiles to show yet.</Text>
            )}
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {error !== null && <Text style={styles.error}>{error}</Text>}
            {loadingMore && <ActivityIndicator color={colors.primary} />}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.cardWrap}
            disabled={!isLive}
            onPress={() => router.push({ pathname: '/member/[id]', params: { id: item.id } })}
          >
            <FeedCard item={item} />
          </Pressable>
        )}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
      />
      <BottomNav />
    </AppShell>
  );
}

/** The account is verified but unpaid; the fee is the only way forward. */
function SetupFeeBanner() {
  return (
    <Pressable
      accessibilityRole="button"
      style={styles.banner}
      onPress={() => router.push('/setup-fee')}
    >
      <Text style={styles.bannerTitle}>Pay the one-time setup fee</Text>
      <Text style={styles.bannerBody}>
        Your identity is verified. Pay ₹ 17.70 once to activate your account and start browsing
        profiles.
      </Text>
    </Pressable>
  );
}

/**
 * Shown while the feed is still the design placeholder. Discovery needs a
 * session — the API withholds a feed from an anonymous caller — so the preview
 * is honest about being a preview and offers the way in.
 */
function SignInBanner() {
  return (
    <Pressable
      accessibilityRole="button"
      style={styles.banner}
      onPress={() => router.push('/auth')}
    >
      <Text style={styles.bannerTitle}>Sign in to see real profiles</Text>
      <Text style={styles.bannerBody}>
        This is a preview. Sign in with your mobile number to start matching.
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gated: {
    flex: 1,
    paddingTop: spacing.sm,
  },
  banner: {
    marginHorizontal: spacing.screenX,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  bannerTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  bannerBody: {
    color: colors.textMuted,
    ...typography.caption,
  },
  content: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.navClearance,
  },
  header: {
    marginBottom: spacing.xl,
  },
  cardWrap: {
    paddingHorizontal: spacing.screenX,
    marginBottom: spacing.lg,
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
