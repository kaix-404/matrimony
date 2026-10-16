import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, shadows, spacing } from '../theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

interface NavItem {
  key: string;
  icon: IconName;
  label: string;
}

const ITEMS: NavItem[] = [
  { key: 'home', icon: 'home', label: 'Home' },
  { key: 'matches', icon: 'heart-outline', label: 'Matches' },
  { key: 'messages', icon: 'chatbubble-outline', label: 'Messages' },
  { key: 'profile', icon: 'person-outline', label: 'Profile' },
];

/**
 * Floating bottom navigation.
 *
 * Absolutely positioned over the canvas so it stays put while content scrolls.
 * The active item (index 0 by default) is a solid coral circle with an inverse
 * white icon; the rest are outlined monochrome strokes.
 */
export function BottomNav({ activeIndex = 0 }: { activeIndex?: number }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        { height: spacing.navHeight + insets.bottom, paddingBottom: insets.bottom },
      ]}
    >
      {ITEMS.map((item, index) => {
        const isActive = index === activeIndex;
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
