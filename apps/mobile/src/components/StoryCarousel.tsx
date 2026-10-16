import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { colors, gradients, radii, spacing } from '../theme/tokens';
import type { Story } from '../data/sample';

/** Horizontally scrollable row of circular avatar rings with gradient borders. */
export function StoryCarousel({ stories }: { stories: Story[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {stories.map((story) => (
        <View key={story.id} style={styles.item}>
          <LinearGradient
            colors={gradients.ring}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ring}
          >
            <Image source={{ uri: story.avatar }} style={styles.avatar} />
          </LinearGradient>
          {story.isNew ? (
            <View style={styles.badge}>
              <Ionicons name="add" size={14} color={colors.white} />
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const RING_SIZE = 52;

const styles = StyleSheet.create({
  row: {
    gap: spacing.md,
    paddingHorizontal: spacing.screenX,
    paddingVertical: spacing.xs,
  },
  item: {
    width: RING_SIZE,
    height: RING_SIZE,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: radii.circle,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  avatar: {
    width: RING_SIZE - 6,
    height: RING_SIZE - 6,
    borderRadius: radii.circle,
    backgroundColor: colors.surface,
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: radii.circle,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
});
