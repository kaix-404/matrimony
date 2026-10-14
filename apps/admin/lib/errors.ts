import { API_BASE_URL } from './env';

/**
 * An error thrown when the admin API answers with a non-2xx status.
 *
 * The dashboard surfaces `message` to the operator and keeps `status` so a
 * caller can special-case 401 (session gone) and 403 (permission missing)
 * without parsing the text.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** Pulls a human-readable message out of a NestJS error body (`{ message }`). */
export function extractMessage(data: unknown): string | null {
  if (typeof data === 'string' && data.trim().length > 0) {
    return data;
  }
  if (typeof data === 'object' && data !== null) {
    const message = (data as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
    if (Array.isArray(message)) {
      const parts = message.filter((item): item is string => typeof item === 'string');
      if (parts.length > 0) {
        return parts.join('; ');
      }
    }
  }
  return null;
}

/** The message to render for any thrown value, without leaking a stack. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong.';
}

/** True when the API rejected the request because the session is no longer valid. */
export function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/**
 * The base URL of the admin API, resolved once at module load. It is server-only
 * (`ADMIN_API_BASE_URL`, never `NEXT_PUBLIC_*`), because the browser never calls
 * the API directly - every request is proxied through the dashboard's own server.
 */
export { API_BASE_URL };
