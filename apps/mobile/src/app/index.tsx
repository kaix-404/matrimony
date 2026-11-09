import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { HomeFeedScreen } from '../screens/HomeFeedScreen';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, spacing } from '../theme/tokens';

/**
 * The app's entry point, and the only place that decides what a launch shows.
 *
 * A signed-out launch goes straight to sign-in, the way a consumer app does:
 * the previous placeholder feed with a "sign in to see real profiles" banner
 * was the first thing a new install showed, which reads as a half-built app.
 * Reading the stored session is asynchronous, so the loading state renders a
 * spinner rather than the sign-in screen — otherwise a returning member would
 * see it flash on every cold start before being dropped into the feed.
 */
export default function Index() {
  const { ready } = useRequireAuth();

  if (!ready) {
    return (
      <View style={styles.startup}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <HomeFeedScreen />;
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
