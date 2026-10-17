import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import type { FeedCardModel } from '../lib/feed-model';
import { colors, gradients, radii, spacing, typography } from '../theme/tokens';

/**
 * Full-bleed media card: imagery behind a heavy bottom scrim with white
 * overlaid text on the left and a badge aligned to the bottom-right.
 *
 * Discovery cards arrive locked — the API withholds name and location until
 * the profile is unlocked — so a locked card shows an unlock prompt and the
 * price instead of identity, and falls back to a placeholder when there is no
 * preview photo at all.
 */
export function FeedCard({ item }: { item: FeedCardModel }) {
  const title = item.title ?? (item.locked ? 'Unlock to view' : null);
  const badgeLabel = item.badge ?? item.priceLabel;

  const body = (
    <>
      <LinearGradient
        colors={gradients.scrim}
        locations={gradients.scrimStops}
        style={StyleSheet.absoluteFill}
      />
      {item.image === null && (
        <View style={styles.placeholderIcon}>
          <Ionicons name="lock-closed-outline" size={36} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.content}>
        <View style={styles.left}>
          {title !== null && (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          )}
          {item.location !== null ? (
            <View style={styles.subline}>
              <Ionicons name="location-outline" size={14} color={colors.white} />
              <Text style={styles.subtext} numberOfLines={1}>
                {item.location}
              </Text>
            </View>
          ) : item.locked ? (
            <View style={styles.subline}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.white} />
              <Text style={styles.subtext} numberOfLines={1}>
                Details hidden until unlock
              </Text>
            </View>
          ) : null}
        </View>
        {badgeLabel !== null && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>
        )}
      </View>
    </>
  );

  if (item.image === null) {
    return <View style={[styles.card, styles.placeholder]}>{body}</View>;
  }

  return (
    <ImageBackground source={{ uri: item.image }} style={styles.card} imageStyle={styles.image}>
      {body}
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
  placeholder: {
    backgroundColor: colors.surfaceAlt,
  },
  placeholderIcon: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
  subtext: {
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
