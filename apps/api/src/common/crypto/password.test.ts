import { hashPassword, verifyPassword } from './password';

/**
 * Password hashing tests.
 *
 * The properties that matter are the ones a bug would silently violate: the same
 * password must verify, a different one must not, two hashes of one password must
 * differ (salt), and any malformed or tampered stored value must fail closed
 * rather than throw or — worse — succeed.
 */

describe('hashPassword', () => {
  it('produces a tagged, parameterised scrypt hash', () => {
    const hash = hashPassword('correct horse battery staple');
    const parts = hash.split('$');

    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe('scrypt');
    expect(Number(parts[1])).toBeGreaterThan(0);
    expect(parts[4]).toMatch(/^[0-9a-f]+$/);
    expect(parts[5]).toMatch(/^[0-9a-f]+$/);
  });

  it('salts, so the same password hashes differently each time', () => {
    expect(hashPassword('repeatable')).not.toBe(hashPassword('repeatable'));
  });
});

describe('verifyPassword', () => {
  it('accepts the correct password', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects the wrong password', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(verifyPassword('Correct horse battery staple', hash)).toBe(false);
    expect(verifyPassword('', hash)).toBe(false);
  });

  it('fails closed on missing or malformed stored values', () => {
    expect(verifyPassword('anything', null)).toBe(false);
    expect(verifyPassword('anything', undefined)).toBe(false);
    expect(verifyPassword('anything', '')).toBe(false);
    expect(verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(verifyPassword('anything', 'bcrypt$10$abc$def')).toBe(false);
  });

  it('fails closed on tampered cost parameters instead of throwing', () => {
    const hash = hashPassword('correct horse battery staple');
    const parts = hash.split('$');
    parts[1] = '0';
    expect(verifyPassword('correct horse battery staple', parts.join('$'))).toBe(false);
  });
});
