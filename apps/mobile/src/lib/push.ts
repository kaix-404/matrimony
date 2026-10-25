import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { apiClient } from './api-client';

/**
 * Push registration (section 42, client decision 2026-10-01: Firebase).
 *
 * The API stores an FCM registration token (Android) or APNs token (iOS), so the
 * native device token is what gets registered — not an Expo push token, which
 * would route deliveries through Expo's push service instead of Firebase.
 *
 * Every call is best-effort: a missing permission, a simulator without a push
 * service, or an unreachable API must never break sign-in, so failures collapse
 * to `null` / a swallowed rejection.
 */
const ANDROID_CHANNEL_ID = 'default';

/** Shows incoming notifications while the app is foregrounded. Idempotent. */
export function installNotificationHandler(): void {
  try {
    if (Platform.OS === 'web') return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // Native module unavailable (e.g. Expo Go without native push config or web)
  }
}

async function ensurePermissionAsync(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;
    if (Platform.OS === 'android') {
      // Android 13+ shows the permission prompt only after a channel exists.
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'General',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      return true;
    }

    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted || asked.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}

async function getDevicePushTokenAsync(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return null;
    if (!(await ensurePermissionAsync())) return null;
    const pushToken = await Notifications.getDevicePushTokenAsync();
    if (pushToken.type === 'web') return null;
    return typeof pushToken.data === 'string' && pushToken.data ? pushToken.data : null;
  } catch {
    return null;
  }
}

/**
 * Registers this device's push token against the signed-in account.
 * Returns the token that was registered, or `null` if none could be obtained.
 */
export async function registerPushDevice(accessToken: string): Promise<string | null> {
  try {
    const token = await getDevicePushTokenAsync();
    if (!token) return null;
    await apiClient.registerDevice(
      { token, platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID' },
      accessToken,
    );
    return token;
  } catch {
    return null;
  }
}

/** Removes the device on logout. Best-effort: a failed delete retries on next register. */
export async function unregisterPushDevice(
  accessToken: string,
  deviceToken: string,
): Promise<void> {
  try {
    await apiClient.unregisterDevice(deviceToken, accessToken);
  } catch {
    // Swallowed deliberately; see registerPushDevice.
  }
}
