import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, gradients, radii, spacing, typography } from '../theme/tokens';

/**
 * What a signed-out launch shows.
 *
 * A cold start used to land straight on the sign-in form, which answers "how do
 * I get in" before the app has said what it is. This screen is the front door
 * instead: the name, one sentence about what a member is asked for and who can
 * see it, and a single button into sign-in. Nothing here is a decision the
 * member has to make — the button is the only action, and the account creation
 * path lives on the screen behind it.
 *
 * It renders no session state of its own: `index` decides between this and the
 * feed, so a member who is already signed in never sees it.
 */
export function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <AppShell>
      <View style={styles.root}>
        <LinearGradient
          colors={gradients.ring}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + spacing.xxl }]}
        >
          <View style={styles.monogram}>
            <Text style={styles.monogramText}>NM</Text>
          </View>

          <View>
            <Text accessibilityRole="header" style={styles.headline}>
              Networth Matrimony
            </Text>
            <Text style={styles.tagline}>
              Verified members, net worth stated up front, and contact details shared only when both
              sides agree.
            </Text>
          </View>
        </LinearGradient>

        <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.xl }]}>
          <PrimaryButton label="Sign in" onPress={() => router.push('/auth')} />
          <Text style={styles.caption}>
            New here? The same screen creates an account with your mobile number.
          </Text>
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenX,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radii.card,
    borderBottomRightRadius: radii.card,
  },
  monogram: {
    alignSelf: 'flex-start',
    width: 52,
    height: 52,
    borderRadius: radii.input,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  monogramText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headline: {
    color: colors.white,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: {
    ...typography.body,
    marginTop: spacing.md,
    color: 'rgba(255, 255, 255, 0.92)',
    lineHeight: 22,
  },
  panel: {
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
