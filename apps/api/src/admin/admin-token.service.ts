import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AdminAccessTokenClaims } from '@matrimony/shared';

/**
 * Issues and verifies administrator access tokens.
 *
 * WHY A SEPARATE SERVICE
 * ----------------------
 * Member and admin tokens share a signing key but must never be interchangeable.
 * The member `TokenService` stamps `typ: 'access'` and rejects anything else, and
 * this service stamps `typ: 'admin_access'` and rejects anything else. Neither
 * will accept the other's token even though both verify against the same secret,
 * so a stolen member token cannot call an admin route and vice-versa.
 *
 * The `roles` claim is intentionally coarse. It names the admin's roles, and the
 * permissions guard resolves those to grants on every request, so revoking a
 * permission takes effect immediately rather than when the token expires.
 */
@Injectable()
export class AdminTokenService {
  constructor(private readonly jwt: JwtService) {}

  async issueAccessToken(admin: { id: string; roles: string[] }): Promise<string> {
    return this.jwt.signAsync({
      sub: admin.id,
      typ: 'admin_access',
      roles: admin.roles,
    });
  }

  /** Verifies an admin access token, returning null when it is unusable. */
  async verifyAccessToken(token: string): Promise<AdminAccessTokenClaims | null> {
    try {
      const claims = await this.jwt.verifyAsync<AdminAccessTokenClaims>(token);
      return claims.typ === 'admin_access' ? claims : null;
    } catch {
      return null;
    }
  }
}
