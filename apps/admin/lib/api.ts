import { cookies } from 'next/headers';
import { ApiError, extractMessage } from './errors';
import { API_BASE_URL } from './env';
import { ACCESS_COOKIE } from './session';

/**
 * Calls the admin API from the server, attaching the administrator's bearer
 * token from the httpOnly session cookie.
 *
 * Every response is read with `cache: 'no-store'`. The dashboard shows moderation
 * and account state that changes the moment another administrator acts, so a
 * cached queue would show a report as open seconds after it was resolved.
 *
 * `token` can be supplied explicitly by the login route handler, which has a
 * fresh token in hand before the cookie exists.
 */
export interface AdminFetchOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  token?: string;
}

export async function adminFetch<T>(path: string, options: AdminFetchOptions = {}): Promise<T> {
  const token = options.token ?? (await cookies()).get(ACCESS_COOKIE)?.value;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });

  const text = await response.text();
  let data: unknown;
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(data) ?? `Request failed (${response.status})`, data);
  }

  return data as T;
}
