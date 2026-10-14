import { JwtService } from '@nestjs/jwt';
import { AdminTokenService } from './admin-token.service';

/**
 * Admin token tests — cross-token separation.
 *
 * Both member and admin tokens are signed with `JWT_ACCESS_SECRET`, so the only
 * thing keeping a member token out of an admin route is the `typ` discriminator.
 * These tests prove that boundary in both directions: an admin token carries
 * `typ: 'admin_access'`, and a member-style token (or a tampered one) is
 * rejected rather than accepted.
 */

const SECRET = 'test-secret-value-not-a-placeholder';

function setup() {
  const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: 900 } });
  return { jwt, service: new AdminTokenService(jwt) };
}

describe('AdminTokenService', () => {
  it('round-trips an admin token and exposes the roles', async () => {
    const { service } = setup();
    const token = await service.issueAccessToken({ id: 'admin_1', roles: ['ADMIN', 'FINANCE_ADMIN'] });
    const claims = await service.verifyAccessToken(token);

    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe('admin_1');
    expect(claims?.typ).toBe('admin_access');
    expect(claims?.roles).toEqual(['ADMIN', 'FINANCE_ADMIN']);
  });

  it('rejects a member-style token even though it verifies against the same secret', async () => {
    const { jwt, service } = setup();
    const memberToken = await jwt.signAsync({ sub: 'user_1', typ: 'access', status: 'ACTIVE', cat: 'LOW' });

    await expect(service.verifyAccessToken(memberToken)).resolves.toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const { service } = setup();
    const other = new JwtService({ secret: 'a-completely-different-secret' });
    const foreign = await other.signAsync({ sub: 'admin_1', typ: 'admin_access', roles: ['ADMIN'] });

    await expect(service.verifyAccessToken(foreign)).resolves.toBeNull();
  });

  it('rejects a malformed token instead of throwing', async () => {
    const { service } = setup();
    await expect(service.verifyAccessToken('not-a-jwt')).resolves.toBeNull();
  });
});
