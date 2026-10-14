import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * RFC 6238 TOTP, the codes Google Authenticator, Authy and 1Password emit by
 * default (SHA-1, 6 digits, 30-second step).
 *
 * Implemented against `node:crypto` rather than a dependency, for the same reason
 * `password.ts` uses scrypt: a native module is the thing most likely to work on
 * one developer's machine and fail in a container. HMAC-SHA1 is small enough to
 * own, and owning it removes a supply-chain edge on the code that guards
 * administrator accounts.
 *
 * SHA-1 is not a weakness here: TOTP uses HMAC, and HMAC-SHA1 is unbroken. The
 * algorithm is fixed by the authenticator apps, so "use SHA-256" is not ours to
 * choose without breaking compatibility.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** RFC 4226 specifies 6 digits and continuous counter values; apps assume both. */
const DIGITS = 6;
const PERIOD_SECONDS = 30;
/** RFC 6238 recommends at least 160 bits of entropy for the shared secret. */
const SECRET_BYTES = 20;

/** RFC 4648 base32 without padding — the encoding authenticator apps display. */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    // Keep only the bits not yet emitted, so `value` never grows past 32 bits.
    value &= (1 << bits) - 1;
  }

  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid base32 character');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }

  return Buffer.from(bytes);
}

/** A fresh random secret, base32-encoded the way the `otpauth://` URI expects. */
export function generateTotpSecret(bytes = SECRET_BYTES): string {
  return base32Encode(randomBytes(bytes));
}

/** The code for the step containing `atMs`. */
export function totpCode(secret: string, atMs: number, step = PERIOD_SECONDS): string {
  const counter = Math.floor(atMs / 1000 / step);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

/**
 * Verifies a code, tolerating `window` steps either side of now.
 *
 * The window exists because the server's clock and the phone's clock are
 * independent; a strict "this step only" check makes a correctly-configured
 * account fail whenever the phone drifts a few seconds. The comparison is
 * constant-time so the response time cannot be used to test codes a digit at a
 * time.
 */
export function verifyTotp(secret: string, code: string, atMs: number, window = 1): boolean {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  const presented = Buffer.from(code);
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = Buffer.from(totpCode(secret, atMs + offset * PERIOD_SECONDS * 1000));
    if (presented.length === expected.length && timingSafeEqual(presented, expected)) {
      return true;
    }
  }

  return false;
}

/** The `otpauth://` URI an authenticator app scans or imports. */
export function otpauthUri(options: {
  issuer: string;
  account: string;
  secret: string;
  period?: number;
}): string {
  // The label is issuer:account, each segment percent-encoded, with the colon
  // left literal so apps that parse the label split on it correctly.
  const label = `${encodeURIComponent(options.issuer)}:${encodeURIComponent(options.account)}`;
  const params = new URLSearchParams({
    secret: options.secret,
    issuer: options.issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(options.period ?? PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
