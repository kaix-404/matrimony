import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, radii, shadows, spacing } from '../theme/tokens';

/** Row of compact pill filter chips; a single chip is active at a time. */
export function FilterChips({ chips }: { chips: string[] }) {
  const [active, setActive] = useState(chips[0]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {chips.map((chip) => {
        const isActive = chip === active;
        return (
          <Pressable
            key={chip}
            onPress={() => setActive(chip)}
            style={[styles.chip, isActive ? styles.chipActive : null]}
          >
            <Text style={[styles.label, isActive ? styles.labelActive : null]}>{chip}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.screenX,
    paddingVertical: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.chip,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  label: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '500',
  },
  labelActive: {
    color: colors.white,
    fontWeight: '600',
  },
});
