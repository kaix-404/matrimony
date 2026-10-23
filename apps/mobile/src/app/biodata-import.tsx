import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import {
  BIODATA_FIELD_LABELS,
  type BiodataExtraction,
  type BiodataValue,
} from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { uploadToStorage } from '../lib/upload';
import { biodataValuesToPatch, summarizeExtraction } from '../lib/biodata';
import { colors, spacing, typography } from '../theme/tokens';

/**
 * "Upload your biodata and we fill the form."
 *
 * The flow is the photo handshake plus a review step:
 *   1. pick a PDF or text file,
 *   2. PUT it straight to storage (the API mints a presigned URL),
 *   3. ask the API to parse the object key into a proposal,
 *   4. let the user untick anything wrong, then save.
 *
 * The step that matters is (4): extraction is best-effort, so this screen never
 * saves on its own. Every field is shown with its value before anything is
 * written, low-confidence ones are flagged, and the user confirms. The save then
 * goes through the ordinary profile update, so a bad value fails validation the
 * same way a typed one would.
 */
export default function BiodataImportScreen() {
  const { ready } = useRequireAuth();
  const { token, refreshUser } = useAuth();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<BiodataExtraction | null>(null);
  /** Fields the user has unticked for saving, by field name. */
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const pick = useCallback(async () => {
    if (!token) return;
    setError(null);
    setExtraction(null);
    setRejected(new Set());

    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'text/plain'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;

    const asset = picked.assets[0];
    if (!asset) return;

    const mime = asset.mimeType === 'application/pdf' ? 'application/pdf' : 'text/plain';
    const size = asset.size ?? 0;
    if (size <= 0 || size > 10 * 1024 * 1024) {
      setError('Choose a PDF or text file no larger than 10 MB.');
      return;
    }

    setBusy(true);
    try {
      const ticket = await apiClient.initiateBiodataUpload({ mime_type: mime, byte_size: size }, token);
      await uploadToStorage(ticket.upload_url, asset.uri, mime);
      const result = await apiClient.parseBiodata(ticket.object_key, token);
      setExtraction(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that document.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  function toggle(field: string) {
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  async function save() {
    if (!token || !extraction) return;

    const accepted = extraction.values.filter((v) => !rejected.has(v.field));
    const patch = biodataValuesToPatch(accepted);
    if (!patch) {
      setError('Nothing is selected to import.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiClient.updateProfile(patch, token);
      await refreshUser();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the imported fields.');
    } finally {
      setSaving(false);
    }
  }

  const acceptedCount =
    extraction === null ? 0 : extraction.values.filter((v) => !rejected.has(v.field)).length;

  if (!ready) {
    return (
      <Screen title="Import from biodata" back>
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Import from biodata"
      subtitle="Upload a PDF or text biodata and we will fill what we can. You review everything before it saves."
      back
      footer={
        extraction === null ? (
          <PrimaryButton label="Choose a file" onPress={pick} loading={busy} />
        ) : (
          <PrimaryButton
            label="Save selected fields"
            onPress={save}
            disabled={acceptedCount === 0}
            loading={saving}
          />
        )
      }
    >
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}

      {busy ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Reading your document…</Text>
        </View>
      ) : null}

      {extraction === null && !busy ? (
        <View style={styles.intro}>
          <Text style={styles.introTitle}>What can be imported</Text>
          <Text style={styles.muted}>
            A typed or exported PDF, or a plain text file. A scanned image has no text to read, so
            you will need to type those details yourself.
          </Text>
          <Pressable accessibilityRole="button" onPress={pick}>
            <Text style={styles.link}>Choose a different file</Text>
          </Pressable>
        </View>
      ) : null}

      {extraction !== null ? (
        <>
          <Text style={styles.summary}>{summarizeExtraction(extraction)}</Text>

          {extraction.warnings.map((warning) => (
            <View key={warning} style={styles.warning}>
              <Text style={styles.warningText}>{warning}</Text>
            </View>
          ))}

          {extraction.values.map((value) => (
            <ProposalRow
              key={value.field}
              value={value}
              rejected={rejected.has(value.field)}
              onToggle={() => toggle(value.field)}
            />
          ))}

          {extraction.unrecognised.length > 0 ? (
            <View style={styles.intro}>
              <Text style={styles.introTitle}>Still needed</Text>
              <Text style={styles.muted}>
                {extraction.unrecognised.map((f) => BIODATA_FIELD_LABELS[f]).join(', ')}
              </Text>
            </View>
          ) : null}

          <Pressable accessibilityRole="button" onPress={pick}>
            <Text style={styles.link}>Upload a different document</Text>
          </Pressable>
        </>
      ) : null}
    </Screen>
  );
}

function ProposalRow({
  value,
  rejected,
  onToggle,
}: {
  value: BiodataValue;
  rejected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !rejected }}
      onPress={onToggle}
      style={[styles.row, rejected && styles.rowRejected]}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{BIODATA_FIELD_LABELS[value.field]}</Text>
        <Text style={styles.rowValue}>{value.value}</Text>
        {value.confidence === 'low' ? (
          <Text style={styles.lowConfidence}>Please double-check this one</Text>
        ) : null}
      </View>
      <Text style={styles.check}>{rejected ? '\u2610' : '\u2611'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  intro: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  introTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  muted: {
    color: colors.textMuted,
    ...typography.caption,
  },
  summary: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  rowRejected: {
    opacity: 0.5,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: colors.textMuted,
    ...typography.caption,
  },
  rowValue: {
    color: colors.textPrimary,
    ...typography.body,
  },
  lowConfidence: {
    color: colors.primary,
    ...typography.caption,
  },
  check: {
    color: colors.primary,
    fontSize: 22,
  },
  warning: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  warningText: {
    color: colors.primary,
    ...typography.caption,
  },
  link: {
    color: colors.primary,
    ...typography.caption,
    fontWeight: '700',
  },
  error: {
    color: colors.primary,
    ...typography.caption,
  },
});
