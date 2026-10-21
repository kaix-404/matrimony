import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MasterList } from '@matrimony/shared';
import {
  DISCOVERY_SORTS,
  type DiscoverySort,
  type TemporaryFilter,
} from '@matrimony/shared';
import { apiClient } from '../lib/api-client';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';
import { colors, radii, spacing, typography } from '../theme/tokens';

interface FilterSheetProps {
  visible: boolean;
  filters: TemporaryFilter;
  sort: DiscoverySort;
  onApply: (filters: TemporaryFilter, sort: DiscoverySort) => void;
  onReset: () => void;
  onClose: () => void;
}

const SORT_LABELS: Record<DiscoverySort, string> = {
  NEWEST_FIRST: 'Newest',
  CLOSEST_FIRST: 'Closest',
  NEWEST_THEN_CLOSEST: 'Newest, then closest',
};

/** The fields this sheet edits, as the API's TemporaryFilter spells them. */
interface Draft {
  ageMin: string;
  ageMax: string;
  heightMin: string;
  heightMax: string;
  city: string;
  state: string;
  education: string | null;
  profession: string | null;
  verifiedPhotosOnly: boolean;
  sort: DiscoverySort;
}

/**
 * Section 10's temporary filters and the discovery sort, in one sheet.
 *
 * These narrow the saved partner preference for this session; they never
 * overwrite it, and "Reset" clears them back to the saved preference. The API
 * rejects an inconsistent range, so Apply is disabled here rather than letting
 * the user submit and read a server error.
 */
export function FilterSheet({
  visible,
  filters,
  sort,
  onApply,
  onReset,
  onClose,
}: FilterSheetProps) {
  const insets = useSafeAreaInsets();
  const [lists, setLists] = useState<MasterList[]>([]);
  const [draft, setDraft] = useState<Draft>(() => toDraft(filters, sort));
  const [error, setError] = useState<string | null>(null);

  // Re-seed the draft from whatever is currently applied each time the sheet
  // opens, so a cancelled edit is genuinely discarded.
  useEffect(() => {
    if (!visible) return;
    setDraft(toDraft(filters, sort));
    setError(null);
  }, [visible, filters, sort]);

  // The education and profession filters match the stored label exactly, so
  // they are picked from the same lists the profile is filled from.
  useEffect(() => {
    if (!visible || lists.length > 0) return;
    let cancelled = false;
    void apiClient
      .getMasterLists()
      .then((response) => {
        if (!cancelled) setLists(response.lists);
      })
      .catch(() => {
        // A picker that failed to load just stays empty; free text is not
        // offered because the server would not match it.
      });
    return () => {
      cancelled = true;
    };
  }, [visible, lists.length]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const ageMin = toInt(draft.ageMin);
  const ageMax = toInt(draft.ageMax);
  const heightMin = toInt(draft.heightMin);
  const heightMax = toInt(draft.heightMax);
  // Mirrors the API's bounds so an out-of-range entry is caught here rather
  // than surfacing as a 400 after Apply.
  const rangeError =
    ageMin !== undefined && ageMax !== undefined && ageMin > ageMax
      ? 'Minimum age cannot exceed maximum age.'
      : heightMin !== undefined && heightMax !== undefined && heightMin > heightMax
        ? 'Minimum height cannot exceed maximum height.'
        : [ageMin, ageMax].some((v) => v !== undefined && (v < 18 || v > 120))
          ? 'Age must be between 18 and 120.'
          : [heightMin, heightMax].some((v) => v !== undefined && (v < 90 || v > 250))
            ? 'Height must be between 90 and 250 cm.'
            : null;

  const apply = () => {
    if (rangeError) {
      setError(rangeError);
      return;
    }
    onApply(toFilters(draft), draft.sort);
  };

  const education = listFor(lists, 'EDUCATION');
  const profession = listFor(lists, 'PROFESSION');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filters</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              onPress={onClose}
            >
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionTitle}>Sort by</Text>
            <View style={styles.chipRow}>
              {DISCOVERY_SORTS.map((option) => (
                <Chip
                  key={option}
                  label={SORT_LABELS[option]}
                  active={draft.sort === option}
                  onPress={() => set('sort', option)}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>Age</Text>
            <View style={styles.pair}>
              <View style={styles.half}>
                <TextField
                  label="Min"
                  value={draft.ageMin}
                  onChangeText={(v) => set('ageMin', v)}
                  keyboardType="number-pad"
                  placeholder="18"
                  maxLength={3}
                />
              </View>
              <View style={styles.half}>
                <TextField
                  label="Max"
                  value={draft.ageMax}
                  onChangeText={(v) => set('ageMax', v)}
                  keyboardType="number-pad"
                  placeholder="60"
                  maxLength={3}
                />
              </View>
            </View>

            <Text style={styles.sectionTitle}>Height (cm)</Text>
            <View style={styles.pair}>
              <View style={styles.half}>
                <TextField
                  label="Min"
                  value={draft.heightMin}
                  onChangeText={(v) => set('heightMin', v)}
                  keyboardType="number-pad"
                  placeholder="140"
                  maxLength={3}
                />
              </View>
              <View style={styles.half}>
                <TextField
                  label="Max"
                  value={draft.heightMax}
                  onChangeText={(v) => set('heightMax', v)}
                  keyboardType="number-pad"
                  placeholder="200"
                  maxLength={3}
                />
              </View>
            </View>

            <Text style={styles.sectionTitle}>Location</Text>
            <TextField
              label="City"
              value={draft.city}
              onChangeText={(v) => set('city', v)}
              autoCapitalize="words"
              maxLength={120}
            />
            <TextField
              label="State"
              value={draft.state}
              onChangeText={(v) => set('state', v)}
              autoCapitalize="words"
              maxLength={120}
            />

            <ChoiceGroup
              title="Education"
              list={education}
              value={draft.education}
              onChange={(v) => set('education', v)}
            />
            <ChoiceGroup
              title="Profession"
              list={profession}
              value={draft.profession}
              onChange={(v) => set('profession', v)}
            />

            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.sectionTitle}>Verified photos only</Text>
                <Text style={styles.hint}>Show only profiles with an approved photo.</Text>
              </View>
              <Switch
                value={draft.verifiedPhotosOnly}
                onValueChange={(v) => set('verifiedPhotosOnly', v)}
                trackColor={{ true: colors.primary, false: colors.surface }}
                thumbColor={colors.white}
              />
            </View>
          </ScrollView>

          {rangeError !== null || error !== null ? (
            <Text style={styles.error}>{rangeError ?? error}</Text>
          ) : null}

          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
            <Pressable accessibilityRole="button" onPress={onReset} hitSlop={8}>
              <Text style={styles.reset}>Reset</Text>
            </Pressable>
            <View style={styles.applyWrap}>
              <PrimaryButton label="Apply filters" onPress={apply} disabled={rangeError !== null} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A labelled row of master-list values with "Any" clearing the choice. */
function ChoiceGroup({
  title,
  list,
  value,
  onChange,
}: {
  title: string;
  list: MasterList | undefined;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const values = list?.values ?? [];
  if (values.length === 0) return null;
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.chipRow}>
        <Chip label="Any" active={value === null} onPress={() => onChange(null)} />
        {values.map((option) => (
          <Chip
            key={option.id}
            label={option.value}
            active={value === option.value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : null]}
    >
      <Text style={[styles.chipLabel, active ? styles.chipLabelActive : null]}>{label}</Text>
    </Pressable>
  );
}

function toDraft(filters: TemporaryFilter, sort: DiscoverySort): Draft {
  return {
    ageMin: filters.age_min?.toString() ?? '',
    ageMax: filters.age_max?.toString() ?? '',
    heightMin: filters.height_min_cm?.toString() ?? '',
    heightMax: filters.height_max_cm?.toString() ?? '',
    city: filters.city ?? '',
    state: filters.state ?? '',
    education: filters.education ?? null,
    profession: filters.profession ?? null,
    verifiedPhotosOnly: filters.verified_photos_only === true,
    sort,
  };
}

function toFilters(draft: Draft): TemporaryFilter {
  const filters: TemporaryFilter = {};
  const ageMin = toInt(draft.ageMin);
  const ageMax = toInt(draft.ageMax);
  const heightMin = toInt(draft.heightMin);
  const heightMax = toInt(draft.heightMax);
  if (ageMin !== undefined) filters.age_min = ageMin;
  if (ageMax !== undefined) filters.age_max = ageMax;
  if (heightMin !== undefined) filters.height_min_cm = heightMin;
  if (heightMax !== undefined) filters.height_max_cm = heightMax;
  const city = draft.city.trim();
  if (city !== '') filters.city = city;
  const state = draft.state.trim();
  if (state !== '') filters.state = state;
  if (draft.education !== null) filters.education = draft.education;
  if (draft.profession !== null) filters.profession = draft.profession;
  if (draft.verifiedPhotosOnly) filters.verified_photos_only = true;
  return filters;
}

/** Whole numbers only; a non-numeric entry is treated as unset. */
function toInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function listFor(lists: MasterList[], key: string): MasterList | undefined {
  return lists.find((list) => list.key === key);
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: colors.textPrimary,
    ...typography.h1,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipLabel: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '500',
  },
  chipLabelActive: {
    color: colors.white,
    fontWeight: '600',
  },
  pair: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  half: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleText: {
    flex: 1,
    gap: spacing.xs,
  },
  hint: {
    color: colors.textMuted,
    ...typography.caption,
  },
  error: {
    color: colors.primary,
    ...typography.caption,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },
  reset: {
    color: colors.textStrong,
    ...typography.title,
  },
  applyWrap: {
    flex: 1,
  },
});
