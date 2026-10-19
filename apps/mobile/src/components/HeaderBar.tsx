import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, spacing, typography } from '../theme/tokens';

/** Single-row top bar: brand mark on the left, notifications bell on the right. */
export function HeaderBar() {
  const insets = useSafeAreaInsets();
  const { status } = useAuth();

  return (
    <View style={[styles.row, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.brand}>
        <Ionicons name="flame" size={22} color={colors.primary} />
        <Text style={styles.brandText}>Networth Matrimony</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        hitSlop={8}
        onPress={() => router.push(status === 'signedIn' ? '/notifications' : '/auth')}
      >
        <Ionicons name="notifications-outline" size={22} color={colors.textStrong} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenX,
    paddingBottom: spacing.md,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandText: {
    color: colors.textPrimary,
    ...typography.brand,
  },
});
