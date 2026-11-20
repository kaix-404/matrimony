import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { useRequireAuth } from '../lib/use-require-auth';
import { uploadPickedFile } from '../lib/upload';
import { colors, radii, spacing, typography } from '../theme/tokens';

/**
 * "Verify with a document" — the D9 fallback.
 *
 * DigiLocker is the preferred method because no copy of anything is retained. It
 * can also be unreachable for reasons that have nothing to do with the member
 * (in production the supplier refuses the server's IP addresses), and identity
 * verification gates discovery for the whole product — so this path exists.
 *
 * It differs from DigiLocker in one way that has to be said plainly on the
 * screen: a copy of the Aadhaar is stored, because a person has to look at it.
 * The consent recorded at submit time is what makes that lawful here, and the
 * copy is only ever reachable through a short-lived signed link in the admin
 * console.
 *
 * Nothing here verifies anybody: submitting only puts the document in the review
 * queue, and an administrator's decision is what moves the account.
 */

/**
 * The version of the notice shown on this screen.
 *
 * Stored with the consent record, so "they agreed" can be tied to the words they
 * agreed to rather than to whatever the screen says later.
 */
const POLICY_VERSION = 'manual-document-v1';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

type AllowedMime = (typeof ALLOWED_MIME)[number];

export default function VerificationDocumentScreen() {
  const { ready } = useRequireAuth();
  const { token } = useAuth();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickAndSubmit = useCallback(async () => {
    if (!token) return;
    setError(null);

    const picked = await DocumentPicker.getDocumentAsync({
      type: [...ALLOWED_MIME],
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;

    const asset = picked.assets[0];
    if (!asset) return;

    const declared =
      asset.mimeType && (ALLOWED_MIME as readonly string[]).includes(asset.mimeType)
        ? (asset.mimeType as AllowedMime)
        : mimeFromUri(asset.uri);

    if (!(ALLOWED_MIME as readonly string[]).includes(declared)) {
      setError('Choose a JPEG, PNG or WebP photo, or a PDF.');
      return;
    }

    const size = asset.size ?? 0;
    if (size <= 0 || size > MAX_BYTES) {
      setError('The file must be 10 MB or smaller.');
      return;
    }

    setBusy(true);
    try {
      const ticket = await apiClient.initiateManualDocumentUpload(
        { mime_type: declared, byte_size: size },
        token,
      );
      await uploadPickedFile({
        presignedUrl: ticket.upload_url,
        fileUri: asset.uri,
        mimeType: declared,
        viaApi: (blob, contentType) =>
          apiClient.uploadManualDocumentBytes(ticket.object_key, blob, contentType, token),
      });
      await apiClient.submitManualDocument(
        { object_key: ticket.object_key, policy_version: POLICY_VERSION },
        token,
      );
      // The status screen re-reads on focus and will show "under review".
      router.replace('/verification');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the document. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  if (!ready) {
    return (
      <Screen title="Verify with a document" back>
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Verify with a document"
      subtitle="Upload a photo or scan of your Aadhaar and our team will review it."
      back
      footer={
        <PrimaryButton
          label="Choose a document"
          onPress={() => void pickAndSubmit()}
          loading={busy}
        />
      }
    >
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}

      {busy ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Sending your document…</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What to upload</Text>
        <Text style={styles.muted}>
          The front of your Aadhaar card, as a photo or a PDF. The name and date of birth must be
          readable — that is what our team checks against your profile.
        </Text>
        <Text style={styles.muted}>Up to 10 MB. JPEG, PNG, WebP or PDF.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What happens to your document</Text>
        <Text style={styles.muted}>
          Unlike DigiLocker, this path keeps a copy: a person has to look at it. Only the review
          team can open it, through a link that expires in minutes, and it is deleted when your
          account is.
        </Text>
        <Text style={styles.muted}>
          We review documents in the order they arrive, usually within a day. Your profile stays
          offline until the check passes.
        </Text>
      </View>

      <Text style={styles.muted}>
        By choosing a document you consent to your Aadhaar details being processed to verify your
        identity. We never store the Aadhaar number itself.
      </Text>
    </Screen>
  );
}

function mimeFromUri(uri: string): AllowedMime {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}

const styles = StyleSheet.create({
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  card: {
    padding: spacing.lg,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  muted: {
    color: colors.textMuted,
    ...typography.caption,
  },
  error: {
    color: colors.primary,
    ...typography.body,
  },
});
