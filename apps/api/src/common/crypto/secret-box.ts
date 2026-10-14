import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption for small secrets at rest — here, an administrator's
 * TOTP secret.
 *
 * WHY ENCRYPT A TOTP SECRET
 * -------------------------
 * A TOTP shared secret is bearer-equivalent: anyone who reads it can mint valid
 * codes indefinitely. Stored in plaintext, a single read-only database leak
 * defeats the second factor for every administrator at once. Encrypting it under
 * a key that lives in the environment rather than the database means a database
 * dump alone is not enough.
 *
 * The format is versioned (`v1.` prefix) so the scheme can change without
 * guessing at the shape of old rows, and AES-256-GCM is used rather than CBC so
 * tampering is detected rather than decrypted into garbage.
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

export class SecretBox {
  private readonly key: Buffer;

  /**
   * Derives a fixed 32-byte key from the configured secret.
   *
   * The environment variable is expected to be a high-entropy value from a
   * secret manager (`openssl rand -base64 48`), so a single SHA-256 pass is
   * enough to land on exactly 32 bytes; a password-style KDF would only matter
   * if the input were low-entropy, which it must not be.
   */
  constructor(keyMaterial: string) {
    if (!keyMaterial) {
      throw new Error('SecretBox requires key material');
    }
    this.key = createHash('sha256').update(keyMaterial).digest().subarray(0, KEY_BYTES);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(
      '.',
    );
  }

  /**
   * Reverses {@link encrypt}. Throws on anything malformed or tampered with —
   * there is no partial success, because a wrong key must fail closed rather than
   * yield a secret that then fails an MFA check for a confusing reason.
   */
  decrypt(payload: string): string {
    const parts = payload.split('.');
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new Error('Unrecognised secret payload');
    }

    const [, iv, tag, ciphertext] = parts;
    if (!iv || !tag || !ciphertext) {
      throw new Error('Malformed secret payload');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
