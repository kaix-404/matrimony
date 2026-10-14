import { decodeJwtPayload, isFresh, readAdminClaims } from './jwt';

function makeToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.not-a-real-signature`;
}

const ADMIN_CLAIMS = {
  sub: 'admin_1',
  typ: 'admin_access',
  roles: ['ADMIN'],
  iat: 1_000,
  exp: 2_000,
};

describe('decodeJwtPayload', () => {
  it('decodes a payload without verifying the signature', () => {
    expect(decodeJwtPayload(makeToken(ADMIN_CLAIMS))).toMatchObject({ sub: 'admin_1' });
  });

  it('returns null for a missing, malformed or non-JSON token', () => {
    expect(decodeJwtPayload(undefined)).toBeNull();
    expect(decodeJwtPayload('not-a-token')).toBeNull();
    expect(decodeJwtPayload('a.b')).toBeNull();
  });
});

describe('readAdminClaims', () => {
  it('accepts an admin_access token', () => {
    expect(readAdminClaims(makeToken(ADMIN_CLAIMS))?.sub).toBe('admin_1');
  });

  it('rejects a member token, which is a different type', () => {
    expect(readAdminClaims(makeToken({ ...ADMIN_CLAIMS, typ: 'access' }))).toBeNull();
  });

  it('rejects a token missing required claims', () => {
    expect(readAdminClaims(makeToken({ typ: 'admin_access', sub: 'x' }))).toBeNull();
  });
});

describe('isFresh', () => {
  it('is true when the token outlives the skew window', () => {
    expect(isFresh(makeToken(ADMIN_CLAIMS), 60, 1_800)).toBe(true);
  });

  it('is false when the token expires within the skew window', () => {
    expect(isFresh(makeToken(ADMIN_CLAIMS), 60, 1_950)).toBe(false);
  });

  it('is false for a token that is not an admin token', () => {
    expect(isFresh(makeToken({ typ: 'access', sub: 'x', exp: 9_999_999, roles: [] }), 60, 0)).toBe(false);
  });
});
