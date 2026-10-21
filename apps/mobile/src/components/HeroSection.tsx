import { StyleSheet, View } from 'react-native';
import { spacing } from '../theme/tokens';
import { filterChips, stories } from '../data/sample';
import { FilterChips } from './FilterChips';
import { FilterHeroCard } from './FilterHeroCard';
import { SearchFilterRow } from './SearchFilterRow';
import { StoryCarousel } from './StoryCarousel';

export type HeroVariant = 1 | 2 | 3 | 4;

/**
 * The interchangeable hero/search area.
 *
 * Four variants from the design spec are supported by a single prop so a screen
 * can pick one and a preview screen can show them all side by side.
 */
export function HeroSection({
  variant,
  onOpenFilters,
  filtersActive = false,
}: {
  variant: HeroVariant;
  onOpenFilters?: () => void;
  filtersActive?: boolean;
}) {
  switch (variant) {
    case 1:
      return (
        <View style={styles.stack}>
          <SearchFilterRow onOpenFilters={onOpenFilters} filtersActive={filtersActive} />
          <StoryCarousel stories={stories} />
        </View>
      );
    case 2:
      return (
        <View style={styles.stack}>
          <SearchFilterRow onOpenFilters={onOpenFilters} filtersActive={filtersActive} />
          <FilterChips chips={filterChips} />
        </View>
      );
    case 3:
      return <FilterHeroCard />;
    case 4:
      return <SearchFilterRow onOpenFilters={onOpenFilters} filtersActive={filtersActive} />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.lg,
  },
});
