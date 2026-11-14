import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { HomeFeedScreen } from '../screens/HomeFeedScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { useAuth } from '../lib/auth-context';
import { colors, spacing } from '../theme/tokens';

/**
 * The app's entry point, and the only place that decides what a launch shows.
 *
 * A signed-out launch lands on the welcome screen rather than the sign-in form:
 * the first thing a new install shows should say what the app is before it asks
 * for a mobile number. The sign-in form is one button away, and it handles
 * account creation on the same screen.
 *
 * Reading the stored session is asynchronous, so `loading` renders a spinner
 * rather than the welcome screen — otherwise a returning member would see it
 * flash on every cold start before being dropped into the feed.
 */
export default function Index() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.startup}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return status === 'signedIn' ? <HomeFeedScreen /> : <WelcomeScreen />;
}

const styles = StyleSheet.create({
  startup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
});
