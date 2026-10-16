import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import { colors, gradients, radii, spacing, typography } from '../theme/tokens';
import type { FeedItem } from '../data/sample';

/**
 * Full-bleed media card: imagery behind a heavy bottom scrim with white
 * overlaid text on the left and a badge aligned to the bottom-right.
 */
export function FeedCard({ item }: { item: FeedItem }) {
  return (
    <ImageBackground source={{ uri: item.image }} style={styles.card} imageStyle={styles.image}>
      <LinearGradient
        colors={gradients.scrim}
        locations={gradients.scrimStops}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <View style={styles.left}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.subline}>
            <Ionicons name="location-outline" size={14} color={colors.white} />
            <Text style={styles.location} numberOfLines={1}>
              {item.location}
            </Text>
          </View>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.badge}</Text>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 16 / 11,
    borderRadius: radii.card,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: colors.surface,
  },
  image: {
    borderRadius: radii.card,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: spacing.xl,
    gap: spacing.md,
  },
  left: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  subline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  location: {
    color: colors.white,
    ...typography.caption,
    opacity: 0.9,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  badgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
});
