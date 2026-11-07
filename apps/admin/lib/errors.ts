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

/**
 * The message for a request that never reached the API at all.
 *
 * A thrown `fetch` used to escape a route handler and reach the browser as a
 * blank 500, which tells an operator nothing: a wrong `ADMIN_API_BASE_URL`, a
 * refused connection and a runtime without global `fetch` all look identical.
 * Naming the host it tried is the one detail that separates "this service is
 * pointed at the wrong place" from "the API is unwell", and the cause message
 * (`ECONNREFUSED`, `ENOTFOUND`) separates those two from the first. Neither is a
 * stack or a secret, so both are safe to show on a sign-in form that only staff
 * reach.
 */
export function describeUpstreamFailure(error: unknown): string {
  let host = API_BASE_URL;
  try {
    host = new URL(API_BASE_URL).host;
  } catch {
    // Leave the raw value: an unparseable base URL is itself the finding.
  }
  const cause =
    error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined;
  return cause === undefined
    ? `The API at ${host} could not be reached.`
    : `The API at ${host} could not be reached (${cause}).`;
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
