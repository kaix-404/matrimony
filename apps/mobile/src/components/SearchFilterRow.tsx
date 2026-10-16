import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, shadows, spacing } from '../theme/tokens';
import { SearchBar } from './SearchBar';

/**
 * Variant 4: the pill search field sitting beside an independent square filter
 * button with a subtle border and soft elevation.
 */
export function SearchFilterRow() {
  return (
    <View style={styles.row}>
      <SearchBar />
      <Pressable accessibilityRole="button" accessibilityLabel="Filters" style={styles.button}>
        <Ionicons name="options-outline" size={22} color={colors.textStrong} />
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
});
