import { config } from './config';
import type { CurrentUser, OtpRequested, TokenPair } from '@matrimony/shared';
import {
  CompleteRegistrationSchema,
  RefreshSchema,
  RequestOtpSchema,
  VerifyOtpSchema,
} from '@matrimony/shared';

function buildUrl(path: string): string {
  const base = config.apiBaseUrl.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return base + '/' + p;
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
}

export const apiClient = new ApiClient();
