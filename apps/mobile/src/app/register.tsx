import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { NetWorthCategoryOption } from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SelectList, type SelectOption } from '../components/SelectList';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { colors, spacing, typography } from '../theme/tokens';

/**
 * Net-worth band selection, the second half of registration.
 *
 * Section 36 makes the band the partition key for discovery and section B1
 * makes it immutable after this point, so this is the one screen that sets it
 * and there is deliberately no edit path anywhere else in the app. Bands come
 * from `GET /master-data/net-worth-categories` rather than a hardcoded list —
 * an admin adds a band, and a client release should not be required to offer it.
 */
export default function RegisterScreen() {
  const { mobile } = useLocalSearchParams<{ mobile?: string }>();
  const { signIn } = useAuth();

  const [categories, setCategories] = useState<NetWorthCategoryOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const options = await apiClient.getNetWorthCategories();
        if (cancelled) return;
        setCategories(options.filter((option) => option.is_discoverable));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the bands.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options: SelectOption[] = categories.map((category) => ({
    value: category.key,
    label: category.label,
    description: category.description,
  }));

  async function submit() {
    if (!mobile || !selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiClient.register({ mobile, networth_category: selected });
      await signIn(result, result.user);
      // Registration creates the account, not the profile. Section 8's required
      // fields are collected next, before the user is shown an empty feed.
      router.replace('/onboarding');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen
      title="Your net-worth band"
      subtitle="This decides who can find you, and who you can find. It cannot be changed later."
      back
      footer={
        <PrimaryButton
          label="Continue"
          onPress={submit}
          disabled={!selected}
          loading={submitting}
        />
      }
    >
      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <SelectList options={options} value={selected} onChange={setSelected} />
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  error: {
    color: colors.primary,
    ...typography.caption,
  },
});
