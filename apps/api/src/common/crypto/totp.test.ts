import { describe, it, expect } from '@jest/globals';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  totpCode,
  verifyTotp,
} from './totp';

/**
 * The RFC 6238 Appendix B vectors use the ASCII secret `12345678901234567890`
 * and eight digits. This implementation emits six, which is a prefix-compatible
 * truncation: 10^6 divides 10^8, so the six-digit code is the last six digits of
 * the published eight-digit one. Encoding that ASCII secret in base32 gives the
 * constant below, so the vectors test the real algorithm rather than a
 * self-consistent reimplementation of it.
 */
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

const RFC_VECTORS: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

describe('base32', () => {
  it('encodes to the message the authenticator apps expect', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('round-trips arbitrary bytes', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it('ignores padding and whitespace, which apps add', () => {
    expect(base32Decode(`${RFC_SECRET}======`).equals(base32Decode(RFC_SECRET))).toBe(true);
    expect(base32Decode('gezd gnbv').length).toBe(5);
  });

  it('refuses a character outside the alphabet', () => {
    expect(() => base32Decode('0189')).toThrow(/Invalid base32/);
  });
});

describe('totpCode', () => {
  it.each(RFC_VECTORS)('matches RFC 6238 at t=%is', (seconds, expected) => {
    expect(totpCode(RFC_SECRET, seconds * 1000)).toBe(expected);
  });

  it('generates a 20-byte secret, which is 32 base32 characters', () => {
    const secret = generateTotpSecret();
    expect(secret).toHaveLength(32);
    expect(base32Decode(secret)).toHaveLength(20);
    // Freshly generated, so two secrets must not collide.
    expect(generateTotpSecret()).not.toBe(secret);
  });
});

describe('verifyTotp', () => {
  // t=59 is the start of a step, so a small skew stays inside the same step and
  // the boundaries are easier to reason about.
  const at = 1111111111 * 1000;

  it('accepts the current code', () => {
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, at), at)).toBe(true);
  });

  it('tolerates one step of clock drift in either direction', () => {
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, at - 30_000), at)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, at + 30_000), at)).toBe(true);
  });

  it('rejects a code from two steps away', () => {
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, at - 60_000), at)).toBe(false);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, at + 60_000), at)).toBe(false);
  });

  it('rejects a wrong code and a malformed one', () => {
    const current = totpCode(RFC_SECRET, at);
    const wrong = current === '000000' ? '000001' : '000000';
    expect(verifyTotp(RFC_SECRET, wrong, at)).toBe(false);
    expect(verifyTotp(RFC_SECRET, '12345', at)).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef', at)).toBe(false);
    expect(verifyTotp(RFC_SECRET, '1234567', at)).toBe(false);
  });
});

describe('otpauthUri', () => {
  it('builds a scannable URI with the parameters the apps require', () => {
    const uri = otpauthUri({ issuer: 'Networth Matrimony', account: 'boss@example.com', secret: RFC_SECRET });
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
    expect(uri).toContain('algorithm=SHA1');
    // The email and the space in the issuer are percent-encoded in the label.
    expect(uri).toContain('boss%40example.com');
    expect(uri).toContain('Networth%20Matrimony');
  });
});
