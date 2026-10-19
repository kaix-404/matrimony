import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { OwnPhoto } from '@matrimony/shared';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { uploadToStorage } from '../lib/upload';
import { useRequireAuth } from '../lib/use-require-auth';
import { colors, radii, spacing, typography } from '../theme/tokens';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

const STATUS_LABELS: Record<OwnPhoto['status'], string> = {
  PENDING_REVIEW: 'In review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

/**
 * The caller's own photos (section 9).
 *
 * Uploads go straight to object storage via a presigned PUT: reserve a slot,
 * PUT the bytes, confirm the dimensions. A photo is not visible to anyone until
 * a moderator approves it, so every card shows its review state and the reason
 * when one is rejected. Only single-person photos are offered — the client
 * confirmed on 2026-10-15 that family photos are not needed.
 */
export default function PhotosScreen() {
  const { ready } = useRequireAuth();
  const { token } = useAuth();

  const [photos, setPhotos] = useState<OwnPhoto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setPhotos(await apiClient.listPhotos(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your photos.');
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      setPhotos(null);
      void load();
    }, [ready, load]),
  );

  async function addPhoto() {
    if (!token) return;
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access is needed to add a photo.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });
    if (picked.canceled) return;

    const asset = picked.assets[0];
    if (!asset) return;

    const mime = asset.mimeType ?? mimeFromUri(asset.uri);
    if (!ALLOWED_MIME.includes(mime as (typeof ALLOWED_MIME)[number])) {
      setError('Photos must be JPEG, PNG or WebP.');
      return;
    }
    // The size is declared to the API up front, so it has to be known here.
    if (asset.fileSize === undefined) {
      setError('Could not read the photo size. Try a different photo.');
      return;
    }
    if (asset.fileSize > MAX_BYTES) {
      setError('Photos must be 5 MB or smaller.');
      return;
    }

    setBusy(true);
    try {
      const ticket = await apiClient.initiatePhotoUpload(
        { mime_type: mime as (typeof ALLOWED_MIME)[number], byte_size: asset.fileSize, photo_type: 'SINGLE' },
        token,
      );
      await uploadToStorage(ticket.upload_url, asset.uri, mime);
      setPhotos(
        await apiClient.completePhotoUpload(
          { object_key: ticket.object_key, width_px: asset.width, height_px: asset.height },
          token,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload the photo.');
    } finally {
      setBusy(false);
    }
  }

  async function setPrimary(photoId: string) {
    if (!token) return;
    setError(null);
    try {
      setPhotos(await apiClient.setPrimaryPhoto(photoId, token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the primary photo.');
    }
  }

  async function remove(photoId: string) {
    if (!token) return;
    setError(null);
    try {
      await apiClient.deletePhoto(photoId, token);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the photo.');
    }
  }

  return (
    <Screen
      title="Your photos"
      subtitle="A photo is visible to others only after it is approved."
      back
      footer={
        <PrimaryButton label="Add photo" onPress={() => void addPhoto()} loading={busy} />
      }
    >
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}

      {photos === null ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : photos.length === 0 ? (
        <Text style={styles.empty}>No photos yet. Add one to be seen in discovery.</Text>
      ) : (
        photos.map((photo) => (
          <View key={photo.photo_id} style={styles.card}>
            {photo.preview_url ? (
              <Image source={{ uri: photo.preview_url }} style={styles.image} />
            ) : (
              <View style={[styles.image, styles.placeholder]}>
                <Ionicons name="time-outline" size={28} color={colors.textMuted} />
                <Text style={styles.placeholderText}>Processing</Text>
              </View>
            )}
            <View style={styles.meta}>
              <View style={styles.badges}>
                <Text style={[styles.status, statusStyle(photo.status)]}>
                  {STATUS_LABELS[photo.status]}
                </Text>
                {photo.is_primary ? <Text style={styles.primaryBadge}>Primary</Text> : null}
              </View>
              {photo.status === 'REJECTED' && photo.rejection_reason ? (
                <Text style={styles.reason}>{photo.rejection_reason}</Text>
              ) : null}
              <View style={styles.actions}>
                {!photo.is_primary ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void setPrimary(photo.photo_id)}
                    style={styles.action}
                  >
                    <Text style={styles.actionText}>Make primary</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void remove(photo.photo_id)}
                  style={styles.action}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}

function statusStyle(status: OwnPhoto['status']) {
  if (status === 'APPROVED') return styles.statusApproved;
  if (status === 'REJECTED') return styles.statusRejected;
  return styles.statusPending;
}

function mimeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

const styles = StyleSheet.create({
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  empty: {
    color: colors.textMuted,
    ...typography.body,
  },
  card: {
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 240,
    backgroundColor: colors.surfaceAlt,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  placeholderText: {
    color: colors.textMuted,
    ...typography.caption,
  },
  meta: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  status: {
    ...typography.caption,
    fontWeight: '700',
    overflow: 'hidden',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusApproved: {
    color: '#0F7B3F',
    backgroundColor: 'rgba(15,123,63,0.12)',
  },
  statusPending: {
    color: colors.primaryDeep,
    backgroundColor: 'rgba(184,50,128,0.12)',
  },
  statusRejected: {
    color: colors.primary,
    backgroundColor: 'rgba(255,90,67,0.12)',
  },
  primaryBadge: {
    color: colors.textPrimary,
    ...typography.caption,
    fontWeight: '700',
  },
  reason: {
    color: colors.textMuted,
    ...typography.caption,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },
  action: {
    paddingVertical: spacing.xs,
  },
  actionText: {
    color: colors.primaryDeep,
    ...typography.title,
  },
  removeText: {
    color: colors.primary,
    ...typography.title,
  },
  error: {
    color: colors.primary,
    ...typography.caption,
  },
});
