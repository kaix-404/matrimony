import { SMS_UNAVAILABLE_CODE } from '@matrimony/shared';

/**
 * A non-2xx answer from the API.
 *
 * The status and the machine-readable `code` are kept alongside the message so
 * a screen can react to a specific refusal instead of matching on text. Before
 * this, every failure was a bare `Error` carrying the raw body, which reached
 * the user as `API 500: {"statusCode":500,...}` — unreadable, and unable to
 * distinguish "we deliberately did not send your code" from "something broke".
 */
export class ApiError extends Error {
  readonly status: number;
  /** The API's error code, e.g. `SMS_UNAVAILABLE`. Null when it sent none. */
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Pulls the human message and machine code out of a NestJS error body. */
export function parseApiErrorBody(raw: string): { message: string | null; code: string | null } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    // Not JSON (a proxy's HTML error page, say): keep a short excerpt rather
    // than dumping the whole response into a label.
    const text = raw.trim();
    return { message: text.length > 0 ? text.slice(0, 200) : null, code: null };
  }

  if (typeof data !== 'object' || data === null) {
    return { message: null, code: null };
  }

  const body = data as Record<string, unknown>;
  const code = typeof body.code === 'string' && body.code.trim() !== '' ? body.code : null;
  return { message: textOf(body.message), code };
}

/** Nest puts either a string or a list of validation messages in `message`. */
function textOf(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  if (Array.isArray(value)) {
    const parts = value.filter((item): item is string => typeof item === 'string');
    if (parts.length > 0) {
      return parts.join('; ');
    }
  }
  return null;
}

/**
 * What to tell the user when a code could not be sent.
 *
 * Deliberately silent about the cause. The API answers `SMS_UNAVAILABLE` when
 * the provider cannot deliver, and its detail — an empty MSG91 wallet — is the
 * operator's to fix, not something to put on a stranger's phone. What the user
 * needs is that no SMS is coming and that waiting is pointless, so the copy
 * says exactly that and points at retrying.
 */
const SMS_UNAVAILABLE_MESSAGE =
  'We could not text your code just now. Please try again in a few minutes, ' +
  'or contact support if it keeps happening.';

export function describeOtpSendFailure(error: unknown): string {
  if (error instanceof ApiError && error.code === SMS_UNAVAILABLE_CODE) {
    return SMS_UNAVAILABLE_MESSAGE;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Could not send the code.';
}
