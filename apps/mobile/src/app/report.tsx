import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReportReason } from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SelectList } from '../components/SelectList';
import { TextField } from '../components/TextField';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, spacing, typography } from '../theme/tokens';

/**
 * Section 20 — reporting a profile.
 *
 * The reasons come from the API rather than being listed here: the list is
 * admin-configurable, and a code the dashboard has since retired would file a
 * report that no queue filter matches. The description box appears only for a
 * reason that is flagged as needing one, so the form never asks for text it will
 * then discard.
 *
 * Submitting is terminal on this screen — it shows a receipt instead of returning
 * to the profile, because a report the member cannot see filed looks like it did
 * nothing, and the natural next tap would be to file it again.
 */
export default function ReportScreen() {
  const { ready } = useRequireAuth();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ profileId?: string }>();
  const profileId = typeof params.profileId === 'string' ? params.profileId : null;

  const [reasons, setReasons] = useState<ReportReason[]>([]);
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.listReportReasons(token);
      setReasons(response.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the report reasons.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const chosen = reasons.find((reason) => reason.reason_id === reasonId) ?? null;
  const needsDescription = chosen?.requires_description ?? false;
  const canSubmit = chosen !== null && (!needsDescription || description.trim().length > 0);

  async function submit() {
    if (!token || !profileId || !chosen) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.reportProfile(
        {
          profileId,
          reasonId: chosen.reason_id,
          description: description.trim() || undefined,
        },
        token,
      );
      setFiled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not file your report.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <Screen title="Report profile" back>
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (filed) {
    return (
      <Screen
        title="Report received"
        subtitle="Our moderation team will review it."
        footer={<PrimaryButton label="Done" onPress={() => router.back()} />}
      >
        <Text style={styles.body}>
          Thank you. We do not tell the member who reported them, and you do not need to do anything
          else.
        </Text>
        <Text style={styles.hint}>
          If you no longer want to see this profile in the meantime, you can block it from their
          profile.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen
      title="Report profile"
      subtitle="Tell us what is wrong with this profile."
      back
      footer={
        <PrimaryButton
          label="Submit report"
          onPress={submit}
          disabled={!canSubmit || !profileId}
          loading={busy}
        />
      }
    >
      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {!loading && reasons.length > 0 ? (
        <SelectList
          options={reasons.map((reason) => ({
            value: reason.reason_id,
            label: reason.label,
            description: reason.description ?? undefined,
          }))}
          value={reasonId}
          onChange={(value) => setReasonId(value)}
        />
      ) : null}

      {needsDescription ? (
        <TextField
          label="What happened?"
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the problem so we can check it"
          multiline
          maxLength={2000}
        />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  body: {
    color: colors.textStrong,
    ...typography.body,
  },
  hint: {
    color: colors.textMuted,
    ...typography.caption,
  },
  error: {
    color: colors.primary,
    ...typography.caption,
  },
});
