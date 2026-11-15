import { StyleSheet, Text, View } from 'react-native';
import { CheckboxList } from './CheckboxList';
import { colors, spacing, typography } from '../theme/tokens';

interface CheckboxFieldProps {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  hint?: string;
  /** Row labels for stored keys (an enum shown as prose). */
  labels?: Record<string, string>;
}

/**
 * A titled block of checkbox rows.
 *
 * `CheckboxList` is the app's multi-select control; the client's reference draws
 * these answers as checkbox blocks, so the only thing added here is the heading —
 * and doing that once keeps the profile editor and the preference screen from
 * each growing their own copy of it.
 */
export function CheckboxField({
  label,
  options,
  selected,
  onChange,
  hint,
  labels,
}: CheckboxFieldProps) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <CheckboxList
        options={options.map((value) => ({ value, label: labels?.[value] ?? value }))}
        selected={selected}
        onToggle={(value) =>
          onChange(
            selected.includes(value)
              ? selected.filter((item) => item !== value)
              : [...selected, value],
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  label: {
    color: colors.textStrong,
    ...typography.title,
  },
  hint: {
    color: colors.textMuted,
    ...typography.caption,
  },
});
