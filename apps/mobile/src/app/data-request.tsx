import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { DataRequest } from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, radii, spacing, typography } from '../theme/tokens';

/** Requests still waiting for an answer, so the button knows when not to offer one. */
const OPEN_STATUSES = ['REQUESTED', 'IN_PROGRESS'];

const STATUS_COPY: Record<DataRequest['status'], string> = {
  REQUESTED: 'Received. We have not started on it yet.',
  IN_PROGRESS: 'We are putting your copy together.',
  COMPLETED: 'Answered.',
  REJECTED: 'Refused.',
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

/**
 * Section 21 — asking for a copy of one's own data.
 *
 * The request is a queue entry a person answers, not a download: nothing here
 * assembles an archive, so the screen must not promise an instant file. What it
 * does promise is the date the answer is owed, which comes from the server and is
 * the only part of this that is a statutory commitment.
 *
 * Only one request can be open at a time. The API returns the request already
 * waiting rather than filing a second, so this screen shows the state it gets back
 * instead of tracking a local "already asked" flag that a relaunch would lose.
 */
export default function DataRequestScreen() {
  const { ready } = useRequireAuth();
  const { token } = useAuth();

  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.listDataRequests(token);
      setRequests(response.requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your requests.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const open = requests.find((request) => OPEN_STATUSES.includes(request.status)) ?? null;

  async function request() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiClient.requestDataExport(token);
      // The server decides whether this is a new request or the one already
      // waiting; replacing rather than appending keeps the list honest for both.
      setRequests((current) => [created, ...current.filter((r) => r.id !== created.id)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not file your request.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <Screen title="Your data" back>
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Your data"
      subtitle="Ask for a copy of everything we hold about you."
      back
      footer={
        open ? undefined : (
          <PrimaryButton label="Request my data" onPress={request} loading={busy} />
        )
      }
    >
      <Text style={styles.body}>
        The copy covers what you entered in your profile, your photos, your verification and payment
        history, and your activity such as unlocks and reports. It never includes another member’s
        details.
      </Text>
      <Text style={styles.hint}>
        Someone on our team assembles it by hand, so it is not instant — the date below is the
        latest we will take, and the copy is sent to your registered contact details.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {open ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {open.status === 'IN_PROGRESS' ? 'Being prepared' : 'Request received'}
          </Text>
          <Text style={styles.cardMeta}>Requested {formatDate(open.requested_at)}</Text>
          <Text style={styles.cardBody}>You will hear from us by {formatDate(open.due_at)}.</Text>
        </View>
      ) : null}

      {requests
        .filter((request) => request.id !== open?.id)
        .map((request) => (
          <View key={request.id} style={styles.card}>
            <Text style={styles.cardTitle}>{STATUS_COPY[request.status]}</Text>
            <Text style={styles.cardMeta}>
              Requested {formatDate(request.requested_at)}
              {request.completed_at ? ` · ${formatDate(request.completed_at)}` : ''}
            </Text>
            {request.resolution_notes ? (
              <Text style={styles.cardBody}>{request.resolution_notes}</Text>
            ) : null}
          </View>
        ))}
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
  card: {
    padding: spacing.lg,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    gap: 2,
  },
  cardTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  cardMeta: {
    color: colors.textMuted,
    ...typography.caption,
  },
  cardBody: {
    color: colors.textStrong,
    ...typography.body,
    paddingTop: spacing.sm,
  },
  error: {
    color: colors.primary,
    ...typography.caption,
  },
});
