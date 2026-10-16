import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import { HeroSection, type HeroVariant } from '../components/HeroSection';
import { colors, spacing, typography } from '../theme/tokens';

const VARIANTS: HeroVariant[] = [1, 2, 3, 4];

/** Preview screen that renders all four interchangeable hero variants. */
export default function Variants() {
  return (
    <AppShell>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Hero variants</Text>
        {VARIANTS.map((variant) => (
          <View key={variant} style={styles.block}>
            <Text style={styles.label}>Variant {variant}</Text>
            <HeroSection variant={variant} />
          </View>
        ))}
        <Link href="/" style={styles.link}>
          Back to home
        </Link>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.navClearance,
    gap: spacing.xxl,
  },
  title: {
    paddingHorizontal: spacing.screenX,
    color: colors.textPrimary,
    ...typography.h1,
  },
  block: {
    gap: spacing.md,
  },
  label: {
    paddingHorizontal: spacing.screenX,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  link: {
    paddingHorizontal: spacing.screenX,
    color: colors.primary,
    ...typography.title,
  },
});
