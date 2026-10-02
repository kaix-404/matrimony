import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import { TokenService } from './token.service';
import type { AccessTokenClaims } from '@matrimony/shared';

/** Request augmented by `JwtAuthGuard` after a token has been verified. */
export interface AuthenticatedRequest extends Request {
  auth?: AccessTokenClaims;
}

/**
 * Injects the verified access-token claims into a handler.
 *
 * Named `AuthUser` rather than `CurrentUser` because `@matrimony/shared` exports
 * a `CurrentUser` DTO describing the same account from the app's side; two
 * exports with one name in one file is a collision waiting to happen, and
 * picking the guard name apart from the DTO keeps the two ideas distinct.
 */
export const AuthUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenClaims => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) {
      throw new UnauthorizedException('Not authenticated');
    }
    return request.auth;
  },
);

/**
 * Verifies the bearer token on protected routes.
 *
 * Applied per controller rather than globally: `/health` and `/auth/*` are
 * reachable without a token, and a global guard would need an opt-out list —
 * which is how protected endpoints end up accidentally unlisted.
 */
@Injectable()
export class JwtAuthGuard {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const claims = await this.tokens.verifyAccessToken(header.slice('Bearer '.length).trim());

    if (!claims) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.auth = claims;
    return true;
  }
}
