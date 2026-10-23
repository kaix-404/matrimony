import { config } from './config';
import type {
  AccountDeletionResult,
  BiodataExtraction,
  BiodataUploadTicket,
  CreateProfileInput,
  CurrentUser,
  DeviceTokenResponse,
  DiscoveryResponse,
  ExpiredUnlockResponse,
  InitiateBiodataUploadInput,
  ListNotificationsResponse,
  LockedProfileResponse,
  MasterListsResponse,
  MyProfile,
  NetWorthCategoryOption,
  NetWorthVisibilityPreference,
  NetWorthVisibilityPreferenceState,
  OtpRequested,
  PaymentOrderResponse,
  PaymentStatusResponse,
  ProfileCompleteness,
  ProfileInterests,
  RecommendationsResponse,
  TokenPair,
  UnlockedProfileResponse,
  UnlockListResponse,
  UpdateProfileInput,
} from '@matrimony/shared';
import {
  CompleteRegistrationSchema,
  CreateProfileSchema,
  CreateUnlockOrderSchema,
  DiscoveryQuerySchema,
  ListNotificationsQuerySchema,
  NetWorthVisibilityPreferenceSchema,
  RecommendationsQuerySchema,
  RefreshSchema,
  RegisterDeviceTokenSchema,
  RequestOtpSchema,
  UpdateInterestsSchema,
  UpdateProfileSchema,
  VerifyOtpSchema,
} from '@matrimony/shared';

/** A profile seen through the unlock paywall: locked, expired or unlocked. */
export type ViewedProfile =
  | LockedProfileResponse
  | UnlockedProfileResponse
  | ExpiredUnlockResponse;

/** A reserved upload slot: the key to confirm with and the PUT to send bytes to. */
export interface PhotoUploadTicket {
  upload_url: string;
  object_key: string;
  expires_in_seconds: number;
}

/**
 * The photo upload handshake is the API's alone (it lives in the API's `dto.ts`,
 * not the shared package), so its two input shapes are mirrored here rather than
 * imported. Kept structurally identical to the server schemas.
 */
export interface InitiatePhotoUploadInput {
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  byte_size: number;
  photo_type: 'SINGLE' | 'FAMILY';
}

export interface CompletePhotoUploadInput {
  object_key: string;
  width_px: number;
  height_px: number;
  checksum?: string;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: 'Bearer ' + token };
}

function buildUrl(path: string): string {
  const base = config.apiBaseUrl.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return base + '/' + p;
}

/**
 * Serialises a query object into `qs`-style bracket notation.
 *
 * The API's `DiscoveryQuerySchema` nests temporary filters under `filters`,
 * and Nest's default `qs` parser turns `filters[city]=Pune` back into
 * `{ filters: { city: 'Pune' } }`. Flat keys would be rejected by the
 * `.strict()` schema, so the nesting has to survive the round trip.
 */
function serializeQuery(params: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(raw)) {
      for (const item of raw) parts.push(`${name}=${encodeURIComponent(String(item))}`);
    } else if (typeof raw === 'object') {
      const nested = serializeQuery(raw as Record<string, unknown>, name);
      if (nested) parts.push(nested);
    } else {
      parts.push(`${name}=${encodeURIComponent(String(raw))}`);
    }
  }
  return parts.join('&');
}

class ApiClient {
  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers || {});
    if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(buildUrl(path), {
      ...init,
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error('API ' + response.status + ': ' + text);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as Promise<T>;
  }

  async requestOtp(input: unknown): Promise<OtpRequested & { dev_code?: string }> {
    const body = RequestOtpSchema.parse(input);
    return this.fetchJson('auth/otp/request', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async verifyOtp(
    input: unknown,
  ): Promise<{ verified: boolean; registration_required?: boolean; tokens?: TokenPair }> {
    const body = VerifyOtpSchema.parse(input);
    return this.fetchJson('auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async register(input: unknown): Promise<TokenPair & { user: CurrentUser }> {
    const body = CompleteRegistrationSchema.parse(input);
    return this.fetchJson('auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async refresh(input: unknown): Promise<TokenPair> {
    const body = RefreshSchema.parse(input);
    return this.fetchJson('auth/refresh', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async logout(input: unknown): Promise<void> {
    const body = RefreshSchema.parse(input);
    await this.fetchJson('auth/logout', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async me(token?: string): Promise<CurrentUser> {
    const headers: Record<string, string> = token ? { Authorization: 'Bearer ' + token } : {};
    return this.fetchJson('auth/me', { headers });
  }

  /**
   * The discovery feed.
   *
   * Section 12 withholds name, location and every other locked field here, so
   * the response is photos + an unlock price only. The scope is derived
   * server-side from the caller's saved preference; there is no parameter that
   * can widen it.
   */
  async getDiscovery(input: unknown, token: string): Promise<DiscoveryResponse> {
    const query = DiscoveryQuerySchema.parse(input);
    const qs = serializeQuery(query as unknown as Record<string, unknown>);
    const path = qs ? `discovery?${qs}` : 'discovery';
    return this.fetchJson(path, { headers: { Authorization: 'Bearer ' + token } });
  }

  /** Reference lists for pickers. Public: needed on sign-up before a session exists. */
  async getMasterLists(): Promise<MasterListsResponse> {
    return this.fetchJson('master-data/lists');
  }

  async getNetWorthCategories(): Promise<NetWorthCategoryOption[]> {
    return this.fetchJson('master-data/net-worth-categories');
  }

  /** Registers an FCM token for this account. Re-registering an existing token bumps `last_seen_at`. */
  async registerDevice(input: unknown, token: string): Promise<DeviceTokenResponse> {
    const body = RegisterDeviceTokenSchema.parse(input);
    return this.fetchJson('devices', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Authorization: 'Bearer ' + token },
    });
  }

  async listDevices(token: string): Promise<{ devices: DeviceTokenResponse[] }> {
    return this.fetchJson('devices', { headers: { Authorization: 'Bearer ' + token } });
  }

  /** Removes a stored push token on logout; `204` carries no body. */
  async unregisterDevice(deviceToken: string, accessToken: string): Promise<void> {
    await this.fetchJson('devices/' + encodeURIComponent(deviceToken), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + accessToken },
    });
  }

  // -- own profile ----------------------------------------------------------

  /** The caller's full record. Throws `404` until a profile has been created. */
  async getMyProfile(token: string): Promise<MyProfile> {
    return this.fetchJson('profile', { headers: authHeaders(token) });
  }

  /** Which section 8 fields are still outstanding. */
  async getProfileCompleteness(token: string): Promise<ProfileCompleteness> {
    return this.fetchJson('profile/completeness', { headers: authHeaders(token) });
  }

  async createProfile(input: CreateProfileInput, token: string): Promise<MyProfile> {
    const body = CreateProfileSchema.parse(input);
    return this.fetchJson('profile', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: authHeaders(token),
    });
  }

  async updateProfile(input: UpdateProfileInput, token: string): Promise<MyProfile> {
    const body = UpdateProfileSchema.parse(input);
    return this.fetchJson('profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: authHeaders(token),
    });
  }

  /** Pause or resume the caller's own visibility (section 12). */
  async setProfileVisibility(
    visibility: MyProfile['visibility'],
    token: string,
  ): Promise<MyProfile> {
    return this.fetchJson('profile/visibility', {
      method: 'PATCH',
      body: JSON.stringify({ visibility }),
      headers: authHeaders(token),
    });
  }

  // -- photos (section 9) ---------------------------------------------------

  /** Reserves an upload slot and returns a presigned PUT. */
  async initiatePhotoUpload(
    input: InitiatePhotoUploadInput,
    token: string,
  ): Promise<PhotoUploadTicket> {
    return this.fetchJson('profile/photos/upload', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: authHeaders(token),
    });
  }

  /** Confirms the bytes landed; the photo then waits for moderation. */
  async completePhotoUpload(
    input: CompletePhotoUploadInput,
    token: string,
  ): Promise<MyProfile['photos']> {
    return this.fetchJson('profile/photos/complete', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: authHeaders(token),
    });
  }

  async listPhotos(token: string): Promise<MyProfile['photos']> {
    return this.fetchJson('profile/photos', { headers: authHeaders(token) });
  }

  async setPrimaryPhoto(photoId: string, token: string): Promise<MyProfile['photos']> {
    return this.fetchJson('profile/photos/' + encodeURIComponent(photoId) + '/primary', {
      method: 'PATCH',
      headers: authHeaders(token),
    });
  }

  async deletePhoto(photoId: string, token: string): Promise<void> {
    await this.fetchJson('profile/photos/' + encodeURIComponent(photoId), {
      method: 'DELETE',
      headers: authHeaders(token),
    });
  }

  // -- biodata import -------------------------------------------------------

  /**
   * Reserves an upload slot for a biodata document and returns a presigned PUT.
   *
   * Same three-step handshake as photos: initiate, PUT the bytes straight to
   * storage, then send the key to `/biodata/parse`. The bytes never pass through
   * the API.
   */
  async initiateBiodataUpload(
    input: InitiateBiodataUploadInput,
    token: string,
  ): Promise<BiodataUploadTicket> {
    return this.fetchJson('profile/biodata/upload', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: authHeaders(token),
    });
  }

  /**
   * Asks the API to read the uploaded document and propose profile fields.
   *
   * Read-only on the server: the returned proposal is shown for review and the
   * save goes through `updateProfile` as normal.
   */
  async parseBiodata(objectKey: string, token: string): Promise<BiodataExtraction> {
    return this.fetchJson('profile/biodata/parse', {
      method: 'POST',
      body: JSON.stringify({ object_key: objectKey }),
      headers: authHeaders(token),
    });
  }

  // -- net-worth visibility preferences -------------------------------------

  async getVisibilityPreference(token: string): Promise<NetWorthVisibilityPreferenceState> {
    return this.fetchJson('me/visibility', { headers: authHeaders(token) });
  }

  async saveVisibilityPreference(
    input: NetWorthVisibilityPreference,
    token: string,
  ): Promise<NetWorthVisibilityPreferenceState> {
    const body = NetWorthVisibilityPreferenceSchema.parse(input);
    return this.fetchJson('me/visibility', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: authHeaders(token),
    });
  }

  // -- unlocks and payments -------------------------------------------------

  /** Both views of another user's profile, decided server-side. */
  async viewProfile(profileId: string, token: string): Promise<ViewedProfile> {
    return this.fetchJson('profiles/' + encodeURIComponent(profileId), {
      headers: authHeaders(token),
    });
  }

  async listUnlocks(token: string): Promise<UnlockListResponse> {
    return this.fetchJson('unlocks', { headers: authHeaders(token) });
  }

  /**
   * Opens a Razorpay order for one profile. The amount is never sent — the
   * server derives it from the target's band, so a tampered app cannot name its
   * own price.
   */
  async createUnlockOrder(profileId: string, token: string): Promise<PaymentOrderResponse> {
    const body = CreateUnlockOrderSchema.parse({ profile_id: profileId });
    return this.fetchJson('payments/unlocks', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: authHeaders(token),
    });
  }

  /**
   * Opens the one-time account setup fee order (D9). The amount is the flat
   * platform fee, again derived server-side.
   */
  async createSetupFeeOrder(token: string): Promise<PaymentOrderResponse> {
    return this.fetchJson('payments/setup-fee', {
      method: 'POST',
      headers: authHeaders(token),
    });
  }

  /** Reconciles one of the caller's own payments (section 27). */
  async getPaymentStatus(paymentId: string, token: string): Promise<PaymentStatusResponse> {
    return this.fetchJson('payments/' + encodeURIComponent(paymentId), {
      headers: authHeaders(token),
    });
  }

  // -- recommendations ------------------------------------------------------

  /**
   * The 'For You' feed. When the feature flag is off the API still answers,
   * with `enabled: false`, so the client can hide the surface without a release.
   */
  async getRecommendations(token: string, limit?: number): Promise<RecommendationsResponse> {
    const query = RecommendationsQuerySchema.parse({ limit });
    const qs = serializeQuery(query as unknown as Record<string, unknown>);
    const path = qs ? `recommendations?${qs}` : 'recommendations';
    return this.fetchJson(path, { headers: authHeaders(token) });
  }

  /** The caller's selected interests plus the curated catalogue, for the picker. */
  async getInterests(token: string): Promise<ProfileInterests> {
    return this.fetchJson('profile/interests', { headers: authHeaders(token) });
  }

  /** Replaces the caller's interest selection (whole-set, like the API). */
  async setInterests(interests: string[], token: string): Promise<ProfileInterests> {
    const body = UpdateInterestsSchema.parse({ interests });
    return this.fetchJson('profile/interests', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: authHeaders(token),
    });
  }

  // -- notifications and account -------------------------------------------

  async listNotifications(
    token: string,
    input: { limit?: number; cursor?: string } = {},
  ): Promise<ListNotificationsResponse> {
    const query = ListNotificationsQuerySchema.parse(input);
    const qs = serializeQuery(query as unknown as Record<string, unknown>);
    const path = qs ? `notifications?${qs}` : 'notifications';
    return this.fetchJson(path, { headers: authHeaders(token) });
  }

  /** Section 21: erases the account. Requires a verified `DELETE_ACCOUNT` OTP. */
  async deleteAccount(token: string): Promise<AccountDeletionResult> {
    return this.fetchJson('me/delete-account', {
      method: 'POST',
      headers: authHeaders(token),
    });
  }
}

export const apiClient = new ApiClient();
