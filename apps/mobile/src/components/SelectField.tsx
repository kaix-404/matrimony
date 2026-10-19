import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SelectList, type SelectOption } from './SelectList';
import { colors, radii, spacing, typography } from '../theme/tokens';

interface SelectFieldProps {
  label: string;
  options: SelectOption[];
  /** Current value, or null for "not set". */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Offers a row that clears the selection back to "not set". */
  clearable?: boolean;
}

/**
 * A collapsed single-choice field.
 *
 * `SelectList` is a column of rows, which is right for a two- or three-option
 * question but turns an edit form with several reference lists into a wall of
 * radio buttons. This shows the chosen label in a tappable field and defers the
 * list to a modal, so the same option data serves both presentations.
 */
export function SelectField({
  label,
  options,
  value,
  onChange,
  placeholder = 'Not set',
  clearable = true,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;
  const modalOptions: SelectOption[] = clearable
    ? [{ value: '', label: 'Not set' }, ...options]
    : options;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={styles.field}
      >
        <Text style={selected ? styles.value : styles.placeholder}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={10}
                onPress={() => setOpen(false)}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <SelectList
                options={modalOptions}
                value={value ?? ''}
                onChange={(next) => {
                  onChange(next === '' ? null : next);
                  setOpen(false);
                }}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    width: '100%',
  },
  label: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '600',
  },
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  value: {
    color: colors.textPrimary,
    ...typography.body,
    flexShrink: 1,
  },
  placeholder: {
    color: colors.textMuted,
    ...typography.body,
  },
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    maxHeight: '80%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
});
