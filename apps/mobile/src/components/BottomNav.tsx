import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, shadows, spacing } from '../theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

interface NavItem {
  key: string;
  href: '/' | '/unlocks' | '/notifications' | '/profile';
  icon: IconName;
  label: string;
}

const ITEMS: NavItem[] = [
  { key: 'home', href: '/', icon: 'home', label: 'Home' },
  { key: 'matches', href: '/unlocks', icon: 'heart-outline', label: 'Matches' },
  { key: 'messages', href: '/notifications', icon: 'chatbubble-outline', label: 'Messages' },
  { key: 'profile', href: '/profile', icon: 'person-outline', label: 'Profile' },
];

/**
 * Floating bottom navigation.
 *
 * The active item is derived from the current route rather than passed in, so a
 * screen added later cannot forget to set the highlight — the pathname is the
 * single source of truth. Tapping always replaces, so the tab bar does not grow
 * an unbounded back stack.
 */
export function BottomNav() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  return (
    <View
      style={[
        styles.bar,
        { height: spacing.navHeight + insets.bottom, paddingBottom: insets.bottom },
      ]}
    >
      {ITEMS.map((item) => {
        const isActive = pathname === item.href;
        if (isActive) {
          return (
            <View key={item.key} style={styles.activeButton}>
              <Ionicons name={item.icon} size={22} color={colors.white} />
            </View>
          );
        }
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            hitSlop={8}
            onPress={() => router.replace(item.href)}
          >
            <Ionicons name={item.icon} size={24} color={colors.textMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    ...shadows.floating,
  },
  activeButton: {
    width: 46,
    height: 46,
    borderRadius: radii.circle,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
