import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Administrator password hashing.
 *
 * Admins are the only principals in the system with a password — members sign in
 * with an OTP (section 6) — so this is the one place a password is stored, and it
 * is the one place a database leak could expose a reusable credential.
 *
 * WHY SCRYPT AND NOT BCRYPT/ARGON2
 * --------------------------------
 * `node:crypto` ships scrypt, which is a memory-hard KDF of the same generation as
 * Argon2 and stronger than bcrypt for offline guessing. Using it avoids adding a
 * native dependency to a codebase that has deliberately kept its dependency list
 * short, and a native module is precisely the kind of thing that breaks a Windows
 * dev machine and an Alpine container differently.
 *
 * The stored form keeps the cost parameters, so a future increase can verify old
 * hashes with their original cost and re-hash on next login rather than forcing a
 * global reset. `N/r/p` are validated on read so a tampered row fails closed.
 */

const ALGORITHM = 'scrypt';
/** 2^14 — ~16 MiB per hash with r=8, the scrypt paper's interactive default. */
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
/** Headroom over 128*N*r so scrypt does not reject the parameters. */
const MAX_MEM = 64 * 1024 * 1024;

/** Hashes a plaintext password into the `scrypt$N$r$p$salt$key` storage form. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(plain, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM });
  return [ALGORITHM, N, R, P, salt.toString('hex'), key.toString('hex')].join('$');
}

/**
 * Verifies a plaintext password against a stored hash.
 *
 * Returns false rather than throwing for any malformed or unrecognised stored
 * value: a corrupt column, an empty string or a hash written by a future format
 * must fail closed, never authenticate. The comparison is constant-time so the
 * response time cannot be used to learn the stored key one byte at a time.
 */
export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) {
    return false;
  }

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== ALGORITHM) {
    return false;
  }

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || n <= 0 || r <= 0 || p <= 0) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, 'hex');
    expected = Buffer.from(parts[5]!, 'hex');
  } catch {
    return false;
  }

  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  let actual: Buffer;
  try {
    actual = scryptSync(plain, salt, expected.length, { N: n, r, p, maxmem: MAX_MEM });
  } catch {
    // Parameters a hashing library would accept but this machine cannot afford
    // (for example a tampered N) are treated as a failed login, not a 500.
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
