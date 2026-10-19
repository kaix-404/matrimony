import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme/tokens';

export interface CheckboxOption {
  value: string;
  label: string;
  description?: string;
}

interface CheckboxListProps {
  options: CheckboxOption[];
  selected: string[];
  onToggle: (value: string) => void;
}

/** Multi-select list: checkbox rows for set-valued choices. */
export function CheckboxList({ options, selected, onToggle }: CheckboxListProps) {
  const chosen = new Set(selected);

  return (
    <View style={styles.list}>
      {options.map((option) => {
        const isSelected = chosen.has(option.value);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            onPress={() => onToggle(option.value)}
            style={[styles.row, isSelected && styles.rowSelected]}
          >
            <View style={styles.texts}>
              <Text style={styles.label}>{option.label}</Text>
              {option.description ? <Text style={styles.description}>{option.description}</Text> : null}
            </View>
            <Ionicons
              name={isSelected ? 'checkbox' : 'square-outline'}
              size={22}
              color={isSelected ? colors.primary : colors.textMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceAlt,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: '600',
  },
  description: {
    color: colors.textMuted,
    ...typography.caption,
  },
});
