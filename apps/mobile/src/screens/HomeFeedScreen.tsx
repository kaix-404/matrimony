import { useState } from 'react';
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
import type { DiscoverySort, TemporaryFilter } from '@matrimony/shared';
import { AppShell } from '../components/AppShell';
import { BottomNav } from '../components/BottomNav';
import { FeedCard } from '../components/FeedCard';
import { FilterSheet } from '../components/FilterSheet';
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
  const [filters, setFilters] = useState<TemporaryFilter>({});
  const [sort, setSort] = useState<DiscoverySort>('NEWEST_THEN_CLOSEST');
  const [sheetOpen, setSheetOpen] = useState(false);
  const { items, isLive, loading, refreshing, loadingMore, error, refresh, loadMore } =
    useDiscoveryFeed({ filters, sort });

  const filtersActive = Object.keys(filters).length > 0;

  // D9: verification comes before the fee, and an unverified account is not
  // discoverable either. Like the fee gate below, this state has one action —
  // except for a member whose registration never reached the profile form, who
  // is asked for that first: identity checks and the fee are both pointless on
  // an account with nothing to show.
  if (user?.status === 'PENDING_VERIFICATION') {
    return (
      <AppShell>
        <View style={styles.gated}>
          <HeaderBar />
          {/* Strictly false: an API that predates this field sends nothing, and
              the identity check is the right guess for a member who already has
              a profile. */}
          {user.has_profile === false ? <FinishProfileBanner /> : <VerificationBanner />}
        </View>
        <BottomNav />
      </AppShell>
    );
  }

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
            <HeroSection
              variant={heroVariant}
              onOpenFilters={() => setSheetOpen(true)}
              filtersActive={filtersActive}
            />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.state}>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.stateText}>
                {filtersActive ? 'No profiles match these filters.' : 'No profiles to show yet.'}
              </Text>
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
      <FilterSheet
        visible={sheetOpen}
        filters={filters}
        sort={sort}
        onApply={(nextFilters, nextSort) => {
          setFilters(nextFilters);
          setSort(nextSort);
          setSheetOpen(false);
        }}
        onReset={() => {
          setFilters({});
          setSort('NEWEST_THEN_CLOSEST');
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </AppShell>
  );
}

/**
 * Registered, but the onboarding form was never completed — the app used to
 * offer only the identity check here, which led a member through Aadhaar and the
 * fee without ever creating a profile.
 */
function FinishProfileBanner() {
  return (
    <Pressable
      accessibilityRole="button"
      style={styles.banner}
      onPress={() => router.push('/onboarding')}
    >
      <Text style={styles.bannerTitle}>Finish your profile</Text>
      <Text style={styles.bannerBody}>
        Your account is created, but we still need your name, gender and date of birth. It takes a
        minute.
      </Text>
    </Pressable>
  );
}

/** The account has registered but not passed the mandatory identity check. */
function VerificationBanner() {
  return (
    <Pressable
      accessibilityRole="button"
      style={styles.banner}
      onPress={() => router.push('/verification')}
    >
      <Text style={styles.bannerTitle}>Verify your identity</Text>
      <Text style={styles.bannerBody}>
        Complete a one-time Aadhaar check through DigiLocker to activate your account.
      </Text>
    </Pressable>
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
