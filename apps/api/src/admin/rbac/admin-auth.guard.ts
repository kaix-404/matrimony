import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { AdminPrincipal } from '@matrimony/shared';
import { AdminTokenService } from '../admin-token.service';
import type { AdminRequest } from './admin-request';

/**
 * Injects the authenticated administrator into a handler.
 *
 * Mirrors `AuthUser` on the member side: it throws rather than returning
 * `undefined`, so a handler never has to null-check the principal it was
 * promised by `AdminAuthGuard`.
 */
export const AdminUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminPrincipal => {
    const request = ctx.switchToHttp().getRequest<AdminRequest>();
    if (!request.admin) {
      throw new UnauthorizedException('Not authenticated as an administrator');
    }
    return request.admin;
  },
);

/**
 * Verifies the bearer admin token on protected routes.
 *
 * Deliberately not global: the admin login endpoint must be reachable without a
 * token, and a global guard would need an opt-out list — the same mechanism that
 * lets a protected route end up accidentally unlisted.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly tokens: AdminTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const header = request.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const claims = await this.tokens.verifyAccessToken(header.slice('Bearer '.length).trim());
    if (!claims) {
      throw new UnauthorizedException('Invalid or expired admin token');
    }

    request.admin = { id: claims.sub, roles: claims.roles };
    return true;
  }
}
