import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type {
  InterestOption,
  ProfileInterests,
  RecommendationCard,
  RecommendationsResponse,
} from '@matrimony/shared';
import { CheckboxList } from '../components/CheckboxList';
import { FeedCard } from '../components/FeedCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { fromDiscoveryCard } from '../lib/feed-model';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, radii, spacing, typography } from '../theme/tokens';

/**
 * 'For You': discovery candidates that share at least one curated interest.
 *
 * A recommendation is a discovery card plus the interests the viewer and the
 * candidate have in common; nothing locked by section 12 is exposed here. The
 * feed is only meaningful once the viewer has picked interests, so an empty
 * selection opens the picker instead of an empty list. `enabled: false` is the
 * server-side feature flag answering from a dark deployment; the surface hides
 * itself rather than erroring.
 */
export default function ForYouScreen() {
  const { ready } = useRequireAuth();
  const { token } = useAuth();

  const [interests, setInterests] = useState<ProfileInterests | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const [mine, feed] = await Promise.all([
        apiClient.getInterests(token),
        apiClient.getRecommendations(token),
      ]);
      setInterests(mine);
      setSelected(mine.selected);
      setRecommendations(feed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load recommendations.');
    }
  }, [token]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [ready, load]);

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const save = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiClient.setInterests(selected, token);
      setInterests(updated);
      setEditing(false);
      setRecommendations(await apiClient.getRecommendations(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your interests.');
    } finally {
      setSaving(false);
    }
  }, [token, selected]);

  const enabled = recommendations?.enabled ?? false;
  const chosen = interests?.selected ?? [];
  const pickerOpen = enabled && (editing || chosen.length === 0);

  return (
    <Screen title="For You" subtitle="Profiles that share your interests." bottomNav>
      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {!loading && recommendations !== null && !enabled ? (
        <View style={[styles.card, styles.stateCard]}>
          <Ionicons name="sparkles-outline" size={28} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Personalised matches are coming soon</Text>
          <Text style={styles.stateText}>
            We are still learning who you would like to meet. Keep browsing from Home in the
            meantime.
          </Text>
        </View>
      ) : null}

      {!loading && pickerOpen ? (
        <View style={styles.section}>
          <Text style={styles.lead}>
            Pick a few things you enjoy. We will show profiles that share at least one of them,
            most in common first.
          </Text>
          <CheckboxList
            options={(interests?.available ?? []).map(toOption)}
            selected={selected}
            onToggle={toggle}
          />
          <PrimaryButton
            label="Save interests"
            onPress={() => void save()}
            loading={saving}
            disabled={selected.length === 0}
          />
          {editing && chosen.length > 0 ? (
            <PrimaryButton
              label="Cancel"
              variant="outline"
              onPress={() => {
                setSelected(chosen);
                setEditing(false);
              }}
            />
          ) : null}
        </View>
      ) : null}

      {!loading && enabled && recommendations !== null && !pickerOpen ? (
        <View style={styles.section}>
          <View style={styles.interestsHeader}>
            <Text style={styles.sectionTitle}>Your interests</Text>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setEditing(true)}>
              <Text style={styles.edit}>Edit</Text>
            </Pressable>
          </View>
          <View style={styles.chipRow}>
            {chosen.map((key) => (
              <View key={key} style={styles.chip}>
                <Text style={styles.chipLabel}>{labelFor(interests?.available, key)}</Text>
              </View>
            ))}
          </View>

          {recommendations.items.length === 0 ? (
            <View style={[styles.card, styles.stateCard]}>
              <Text style={styles.stateTitle}>No matches yet</Text>
              <Text style={styles.stateText}>
                Nobody in your discovery scope shares these interests right now. Add a few more to
                widen your matches.
              </Text>
            </View>
          ) : (
            recommendations.items.map((item) => (
              <RecommendationItem
                key={item.profile_id}
                item={item}
                catalogue={interests?.available ?? []}
              />
            ))
          )}
        </View>
      ) : null}

      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

function RecommendationItem({
  item,
  catalogue,
}: {
  item: RecommendationCard;
  catalogue: InterestOption[];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/member/[id]', params: { id: item.profile_id } })}
    >
      <FeedCard item={fromDiscoveryCard(item)} />
      <View style={styles.sharedRow}>
        <Ionicons name="sparkles" size={14} color={colors.primary} />
        {item.shared_interests.map((key) => (
          <Text key={key} style={styles.shared}>
            {labelFor(catalogue, key)}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

function toOption(option: InterestOption) {
  return { value: option.key, label: option.label };
}

function labelFor(catalogue: InterestOption[] | undefined, key: string): string {
  return catalogue?.find((option) => option.key === key)?.label ?? key;
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.lg,
  },
  lead: {
    color: colors.textMuted,
    ...typography.body,
  },
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  card: {
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  stateCard: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  stateTitle: {
    color: colors.textPrimary,
    ...typography.h2,
    textAlign: 'center',
  },
  stateText: {
    color: colors.textMuted,
    ...typography.caption,
    textAlign: 'center',
  },
  interestsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  edit: {
    color: colors.primary,
    ...typography.title,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  chipLabel: {
    color: colors.textStrong,
    ...typography.caption,
  },
  sharedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  shared: {
    color: colors.textMuted,
    ...typography.caption,
  },
  error: {
    color: colors.primary,
    ...typography.body,
  },
});
