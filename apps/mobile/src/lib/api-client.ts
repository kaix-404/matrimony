import { config } from './config';
import type {
  CurrentUser,
  DeviceTokenResponse,
  DiscoveryResponse,
  MasterListsResponse,
  NetWorthCategoryOption,
  OtpRequested,
  TokenPair,
} from '@matrimony/shared';
import {
  CompleteRegistrationSchema,
  DiscoveryQuerySchema,
  RefreshSchema,
  RegisterDeviceTokenSchema,
  RequestOtpSchema,
  VerifyOtpSchema,
} from '@matrimony/shared';

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
}

export const apiClient = new ApiClient();
