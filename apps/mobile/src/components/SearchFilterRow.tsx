import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, shadows, spacing } from '../theme/tokens';
import { SearchBar } from './SearchBar';

/**
 * Variant 4: the pill search field sitting beside an independent square filter
 * button with a subtle border and soft elevation.
 */
export function SearchFilterRow({
  onOpenFilters,
  filtersActive = false,
}: {
  onOpenFilters?: () => void;
  filtersActive?: boolean;
}) {
  return (
    <View style={styles.row}>
      <SearchBar />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={filtersActive ? 'Filters (active)' : 'Filters'}
        onPress={onOpenFilters}
        style={[styles.button, filtersActive ? styles.buttonActive : null]}
      >
        <Ionicons
          name="options-outline"
          size={22}
          color={filtersActive ? colors.primary : colors.textStrong}
        />
        {filtersActive ? <View style={styles.dot} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.screenX,
  },
  button: {
    width: 50,
    height: 50,
    borderRadius: radii.input,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.chip,
  },
  buttonActive: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  dot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: radii.circle,
    backgroundColor: colors.primary,
  },
});
