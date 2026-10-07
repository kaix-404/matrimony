import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { AccessTokenClaims, AccountDeletionResult } from '@matrimony/shared';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountDeletionService } from './account-deletion.service';

/**
 * Section 21 — Settings → Delete Account.
 *
 * Under `/me` rather than under `auth`: this is not a session operation, and
 * `auth` is where tokens are minted. It sits in the moderation module because
 * sections 19-21 are one concern — who may still be shown to whom — and the
 * module already owns the read-side liveness predicate this depends on.
 *
 * The route takes no body. Section 21 asks for re-authentication, not for a
 * payload, and a free-text reason would be a place for a user to leave more PII
 * on the way out than they are trying to remove. Confirmation is a client
 * concern; the only server-side requirement is that the caller still holds a
 * session *and* the mobile number.
 */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class AccountDeletionController {
  constructor(private readonly deletion: AccountDeletionService) {}

  /**
   * 200 rather than the Nest default of 201. Nothing is created — an account
   * stopped existing — and 201 on a delete would be the one status code in the
   * flow that means the opposite of what happened.
   */
  @Post('delete-account')
  @HttpCode(200)
  delete(@AuthUser() claims: AccessTokenClaims): Promise<AccountDeletionResult> {
    return this.deletion.deleteAccount(claims.sub);
  }
}
