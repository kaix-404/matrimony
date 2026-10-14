import type { AdminAccessTokenClaims } from '@matrimony/shared';

/**
 * Decodes a JWT's payload without verifying it.
 *
 * Verification is the API's job and only the API's job: the dashboard never acts
 * on a token's claims beyond deciding whether to render a shell or bounce to the
 * login page, so reading the payload to find `exp` and `roles` is enough. If a
 * tampered token were presented, the API would reject it a moment later; the
 * decoded claims are never trusted as authorisation, only as display hints.
 */

/** base64url -> UTF-8 string. `atob` is present in the Edge runtime and in Node 22. */
function base64UrlDecode(input: string): string | null {
  try {
    const normalised = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

/** The raw claims object, or null when the token is not a readable JWT. */
export function decodeJwtPayload(token: string | undefined | null): Record<string, unknown> | null {
  if (!token) {
    return null;
  }

  const segments = token.split('.');
  const payloadSegment = segments[1];
  if (segments.length !== 3 || payloadSegment === undefined) {
    return null;
  }

  const decoded = base64UrlDecode(payloadSegment);
  if (decoded === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(decoded);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isAdminAccessClaims(value: Record<string, unknown>): value is Record<string, unknown> & AdminAccessTokenClaims {
  return (
    value.typ === 'admin_access' &&
    typeof value.sub === 'string' &&
    typeof value.exp === 'number' &&
    Array.isArray(value.roles)
  );
}

/**
 * The admin access claims from a token, or null when it is missing, malformed,
 * or a different token type. The `typ` check is the same separation the API
 * enforces: a member access token (`typ: 'access'`) is not an admin session.
 */
export function readAdminClaims(token: string | undefined | null): AdminAccessTokenClaims | null {
  const payload = decodeJwtPayload(token);
  if (payload === null || !isAdminAccessClaims(payload)) {
    return null;
  }
  return payload as AdminAccessTokenClaims;
}

/** True when the token's `exp` is further away than `skewSeconds`. */
export function isFresh(token: string | undefined | null, skewSeconds: number, nowSeconds: number): boolean {
  const claims = readAdminClaims(token);
  if (claims === null) {
    return false;
  }
  return claims.exp - nowSeconds > skewSeconds;
}
