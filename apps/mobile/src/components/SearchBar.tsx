import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radii, shadows, spacing } from '../theme/tokens';

type SearchBarProps = Pick<TextInputProps, 'value' | 'onChangeText' | 'onSubmitEditing'> & {
  placeholder?: string;
};

/**
 * Pill-shaped search field.
 *
 * RN has no `box-shadow: inset`, so the "inset" look is approximated with a
 * filled surface tone plus a hairline border.
 */
export function SearchBar({
  placeholder = 'Search by name, city or community',
  value,
  onChangeText,
  onSubmitEditing,
}: SearchBarProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="search" size={18} color={colors.textMuted} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="search"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 50,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    ...shadows.chip,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: 0,
  },
});
