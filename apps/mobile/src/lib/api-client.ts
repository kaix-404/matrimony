import { config } from './config';
import { ApiError, parseApiErrorBody } from './api-errors';
import type {
  AccountDeletionResult,
  BiodataExtraction,
  BlockedListResponse,
  BlockResult,
  BiodataUploadTicket,
  CreateProfileInput,
  CurrentUser,
  DataRequest,
  DataRequestListResponse,
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
  PartnerPreferenceState,
  UpdatePartnerPreferenceInput,
  PaymentOrderResponse,
  PaymentStatusResponse,
  ProfileCompleteness,
  ProfileInterests,
  RecommendationsResponse,
  ReportReasonListResponse,
  ReportSummary,
  TokenPair,
  UnlockedProfileResponse,
  VerificationStatusResponse,
  UnlockListResponse,
  UpdateProfileInput,
} from '@matrimony/shared';
import {
  BlockProfileSchema,
  CompleteRegistrationSchema,
  CreateDataRequestSchema,
  CreateProfileSchema,
  CreateReportSchema,
  CreateUnlockOrderSchema,
  DiscoveryQuerySchema,
  InitiateVerificationSchema,
  ListNotificationsQuerySchema,
  NetWorthVisibilityPreferenceSchema,
  RecommendationsQuerySchema,
  UpdatePartnerPreferenceSchema,
  RefreshSchema,
  RegisterDeviceTokenSchema,
  RequestOtpSchema,
  UpdateInterestsSchema,
  UpdateProfileSchema,
  VerifyOtpSchema,
} from '@matrimony/shared';

/**
 * Minted by the auth provider: given the bearer token the API just refused,
 * return a fresh one, or null when the session is genuinely over.
 *
 * Registered here rather than imported so the client stays a plain transport:
 * the provider owns credentials and this module must not depend on React state.
 */
type UnauthorizedHandler = (staleAccessToken: string) => Promise<string | null>;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Registers the token refresher. Pass null on unmount. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

/** A profile seen through the unlock paywall: locked, expired or unlocked. */
export type ViewedProfile = LockedProfileResponse | UnlockedProfileResponse | ExpiredUnlockResponse;

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
  private async fetchJson<T>(path: string, init?: RequestInit, mayRetry = true): Promise<T> {
    const headers = new Headers(init?.headers || {});
    if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(buildUrl(path), {
      ...init,
      headers,
    });

    // The access token lives 15 minutes, which a member reading profiles will
    // cross mid-session. A refused bearer is not a failed action if a refresh
    // token can mint another, so retry once with the new one — exactly once, so
    // a server that keeps answering 401 cannot loop. Requests without a bearer
    // (OTP, register, refresh itself) skip this entirely.
    if (response.status === 401 && mayRetry && unauthorizedHandler !== null) {
      const bearer = headers.get('Authorization');
      const stale = bearer?.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : null;
      const fresh = stale === null ? null : await unauthorizedHandler(stale);
      if (fresh !== null && fresh !== stale) {
        const retryHeaders = new Headers(headers);
        retryHeaders.set('Authorization', 'Bearer ' + fresh);
        return this.fetchJson<T>(path, { ...init, headers: retryHeaders }, false);
      }
    }

    if (!response.ok) {
      // The body is the API's own account of what went wrong; keeping its code
      // is what lets a screen special-case a refusal (an undeliverable OTP)
      // without matching on prose.
      const { message, code } = parseApiErrorBody(await response.text());
      throw new ApiError(
        response.status,
        message ?? 'Request failed (HTTP ' + response.status + ')',
        code,
      );
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

  /**
   * Section 26: put the profile forward for review.
   *
   * Sendless on purpose — what gets submitted is what has been saved, so there is
   * no way to submit a version the server never stored. The response is the
   * profile as the server now sees it, `PENDING_REVIEW` included.
   */
  async submitProfileForReview(token: string): Promise<MyProfile> {
    return this.fetchJson('profile/submit', { method: 'POST', headers: authHeaders(token) });
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

  // -- partner preferences ---------------------------------------------------

  /** The caller's saved partner preference, plus whether they ever saved one. */
  async getPartnerPreference(token: string): Promise<PartnerPreferenceState> {
    return this.fetchJson('me/partner-preference', { headers: authHeaders(token) });
  }

  /**
   * Replaces the whole preference.
   *
   * The form submits every field, and a cleared field has to stay cleared, so
   * this is a PUT rather than a merge. Parsed locally too: the range checks (a
   * minimum above its maximum) are the same ones the API applies, and catching
   * them here names the field instead of failing the request.
   */
  async savePartnerPreference(
    input: UpdatePartnerPreferenceInput,
    token: string,
  ): Promise<PartnerPreferenceState> {
    const body = UpdatePartnerPreferenceSchema.parse(input);
    return this.fetchJson('me/partner-preference', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: authHeaders(token),
    });
  }

  // -- identity verification (D9) -------------------------------------------

  /** The caller's KYC state. `NOT_STARTED` is a normal answer, not an error. */
  async getVerificationStatus(token: string): Promise<VerificationStatusResponse> {
    return this.fetchJson('verification/status', { headers: authHeaders(token) });
  }

  /**
   * Starts a DigiLocker attempt and returns the consent URL to open.
   *
   * Nothing here can declare verification successful: the verdict only arrives
   * through the vendor's signed webhook, and the app learns it by re-reading
   * the status.
   */
  async startVerification(token: string): Promise<VerificationStatusResponse> {
    const body = InitiateVerificationSchema.parse({ provider: 'DIGILOCKER' });
    return this.fetchJson('verification/initiate', {
      method: 'POST',
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
   * Section 19: the profiles this account has blocked.
   *
   * The list carries a photo and a timestamp, never a name. Blocking is not
   * unlocking, and section 13 withholds the name until payment, so this screen
   * identifies a blocked profile the same way the feed did.
   */
  async listBlocks(token: string): Promise<BlockedListResponse> {
    return this.fetchJson('blocks', { headers: authHeaders(token) });
  }

  /**
   * Blocks a profile, which also removes it from discovery in both directions.
   *
   * The API answers 201 whether or not the row already existed, so a retry after
   * a dropped connection is not an error the user has to understand.
   */
  async blockProfile(profileId: string, token: string): Promise<BlockResult> {
    const body = BlockProfileSchema.parse({ profile_id: profileId });
    return this.fetchJson('blocks', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: authHeaders(token),
    });
  }

  /** Unblocks a profile. 204, including for a profile that was never blocked. */
  async unblockProfile(profileId: string, token: string): Promise<void> {
    return this.fetchJson(`blocks/${encodeURIComponent(profileId)}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
  }

  // -- trust and safety -----------------------------------------------------

  /** Section 20: the reasons the report form renders. Never invented client-side. */
  async listReportReasons(token: string): Promise<ReportReasonListResponse> {
    return this.fetchJson('reports/reasons', { headers: authHeaders(token) });
  }

  /**
   * Files a report about one profile.
   *
   * 201 whether or not an identical report was already open, so a retried submit
   * after a dropped connection reads as success rather than sending the member
   * back to file it again.
   */
  async reportProfile(
    input: { profileId: string; reasonId: string; description?: string },
    token: string,
  ): Promise<ReportSummary> {
    const body = CreateReportSchema.parse({
      profile_id: input.profileId,
      reason_id: input.reasonId,
      ...(input.description ? { description: input.description } : {}),
    });
    return this.fetchJson('reports', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: authHeaders(token),
    });
  }

  // -- privacy --------------------------------------------------------------

  /**
   * Section 21: asks for a copy of this member's own data.
   *
   * The API books the request and tells us the date we owe them an answer; it
   * does not build the archive. Asking again while one is open returns that same
   * request, so a retried tap cannot queue duplicate work for an administrator.
   */
  async requestDataExport(token: string): Promise<DataRequest> {
    const body = CreateDataRequestSchema.parse({ type: 'EXPORT' });
    return this.fetchJson('data-requests', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: authHeaders(token),
    });
  }

  /**
   * The member's own requests, newest first — including the reason a request was
   * refused, which is the part they are entitled to read.
   */
  async listDataRequests(token: string): Promise<DataRequestListResponse> {
    return this.fetchJson('data-requests', { headers: authHeaders(token) });
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
