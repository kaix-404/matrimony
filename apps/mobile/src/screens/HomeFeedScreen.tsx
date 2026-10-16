import { ScrollView, StyleSheet, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import { BottomNav } from '../components/BottomNav';
import { FeedCard } from '../components/FeedCard';
import { HeaderBar } from '../components/HeaderBar';
import { HeroSection, type HeroVariant } from '../components/HeroSection';
import { feedItems } from '../data/sample';
import { spacing } from '../theme/tokens';

/** Home screen: header, hero/search area, discovery feed, and floating nav. */
export function HomeFeedScreen({ heroVariant = 1 }: { heroVariant?: HeroVariant }) {
  return (
    <AppShell>
      <HeaderBar />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <HeroSection variant={heroVariant} />
        <View style={styles.feed}>
          {feedItems.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}
        </View>
      </ScrollView>
      <BottomNav />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.navClearance,
    gap: spacing.xl,
  },
  feed: {
    gap: spacing.lg,
    paddingHorizontal: spacing.screenX,
  },
});
