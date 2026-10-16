import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { colors, gradients, radii, spacing, typography } from '../theme/tokens';

/** A compact white box used inside the dark hero card. */
function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.field, wide ? styles.fieldWide : styles.fieldHalf]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Variant 3: dark photographic hero card with a 2-column grid of white fields
 * (the bottom one spanning the full width) and a flat coral CTA.
 */
export function FilterHeroCard() {
  return (
    <LinearGradient
      colors={gradients.hero}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <Text style={styles.heading}>Find your match</Text>
      <View style={styles.grid}>
        <Field label="Looking for" value="Bride" />
        <Field label="Age" value="24 - 32" />
        <Field label="Community" value="Any community" wide />
      </View>
      <View style={styles.cta}>
        <Text style={styles.ctaText}>Search matches</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.white} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.screenX,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  heading: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  field: {
    height: 40,
    borderRadius: radii.inputSm,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  fieldHalf: {
    width: '47%',
  },
  fieldWide: {
    width: '100%',
  },
  fieldLabel: {
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radii.input,
    backgroundColor: colors.primary,
  },
  ctaText: {
    color: colors.white,
    ...typography.title,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
