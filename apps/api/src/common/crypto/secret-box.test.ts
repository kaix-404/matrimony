import { describe, it, expect } from '@jest/globals';
import { SecretBox } from './secret-box';

const KEY = 'a'.repeat(48);

describe('SecretBox', () => {
  it('round-trips a secret', () => {
    const box = new SecretBox(KEY);
    const payload = box.encrypt('JBSWY3DPEHPK3PXP');
    expect(payload.startsWith('v1.')).toBe(true);
    expect(box.decrypt(payload)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('never stores the plaintext', () => {
    const payload = new SecretBox(KEY).encrypt('JBSWY3DPEHPK3PXP');
    expect(payload).not.toContain('JBSWY3DPEHPK3PXP');
  });

  it('produces a different payload each time, because the IV is random', () => {
    const box = new SecretBox(KEY);
    expect(box.encrypt('same')).not.toBe(box.encrypt('same'));
  });

  it('refuses to decrypt under a different key', () => {
    const payload = new SecretBox(KEY).encrypt('secret');
    expect(() => new SecretBox('b'.repeat(48)).decrypt(payload)).toThrow();
  });

  it('detects tampering rather than returning garbage', () => {
    const box = new SecretBox(KEY);
    const payload = box.encrypt('secret');
    const parts = payload.split('.');
    // Flip a character in the ciphertext segment.
    const flipped = parts[3]!.slice(0, -1) + (parts[3]!.endsWith('A') ? 'B' : 'A');
    expect(() => box.decrypt([parts[0], parts[1], parts[2], flipped].join('.'))).toThrow();
  });

  it('rejects a malformed payload and an unknown version', () => {
    const box = new SecretBox(KEY);
    expect(() => box.decrypt('not-a-payload')).toThrow(/Unrecognised|Malformed/);
    expect(() => box.decrypt('v2.a.b.c')).toThrow(/Unrecognised/);
  });

  it('refuses to construct without key material', () => {
    expect(() => new SecretBox('')).toThrow(/key material/);
  });
});
