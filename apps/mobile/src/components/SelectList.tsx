import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme/tokens';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  /** Rendered but not selectable (e.g. a band that is not discoverable). */
  disabled?: boolean;
}

interface SelectListProps {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
}

/** Single-choice list: radio rows with the selected option highlighted. */
export function SelectList({ options, value, onChange }: SelectListProps) {
  return (
    <View style={styles.list}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: option.disabled }}
            disabled={option.disabled}
            onPress={() => onChange(option.value)}
            style={[styles.row, selected && styles.rowSelected, option.disabled && styles.disabled]}
          >
            <View style={styles.texts}>
              <Text style={styles.label}>{option.label}</Text>
              {option.description ? <Text style={styles.description}>{option.description}</Text> : null}
            </View>
            <Ionicons
              name={selected ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={selected ? colors.primary : colors.textMuted}
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
    paddingVertical: spacing.lg,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceAlt,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  disabled: {
    opacity: 0.5,
  },
  texts: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    color: colors.textPrimary,
    ...typography.title,
  },
  description: {
    color: colors.textMuted,
    ...typography.caption,
  },
});
