import { Body, Controller, HttpCode, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import {
  AdminLoginSchema,
  AdminMfaActivateSchema,
  AdminMfaDisableSchema,
  AdminMfaVerifySchema,
  AdminRefreshSchema,
  type AdminLoginInput,
  type AdminLoginResponse,
  type AdminMfaActivateInput,
  type AdminMfaActivateView,
  type AdminMfaDisableInput,
  type AdminMfaDisableView,
  type AdminMfaSetupView,
  type AdminMfaVerifyInput,
  type AdminPrincipal,
  type AdminRefreshInput,
  type AdminTokenPair,
} from '@matrimony/shared';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthGuard, AdminUser } from './rbac/admin-auth.guard';

/**
 * Administrator authentication.
 *
 * This controller is deliberately NOT guarded as a class: it is where an
 * administrator obtains the token that every guarded admin route requires. The
 * MFA enrollment handlers opt into `AdminAuthGuard` individually, because they
 * act on an authenticated administrator even though they live beside the
 * unguarded login.
 */
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  /**
   * Exchanges email and password for an admin token pair, or — when MFA is
   * enabled — a challenge to pass to `mfa/verify`.
   */
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(AdminLoginSchema)) body: AdminLoginInput,
  ): Promise<AdminLoginResponse> {
    return this.auth.login(body);
  }

  /** Completes an MFA login: the challenge from `login` plus a current code. */
  @Post('mfa/verify')
  @HttpCode(200)
  async verifyMfa(
    @Body(new ZodValidationPipe(AdminMfaVerifySchema)) body: AdminMfaVerifyInput,
  ): Promise<AdminTokenPair> {
    return this.auth.verifyMfa(body);
  }

  /** Begins TOTP enrollment for the signed-in administrator. */
  @Post('mfa/setup')
  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  async setupMfa(@AdminUser() principal: AdminPrincipal): Promise<AdminMfaSetupView> {
    return this.auth.beginMfaEnrollment(principal.id);
  }

  /** Confirms enrollment with a code, persisting the secret only once proven. */
  @Post('mfa/activate')
  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  async activateMfa(
    @Body(new ZodValidationPipe(AdminMfaActivateSchema)) body: AdminMfaActivateInput,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminMfaActivateView> {
    return this.auth.activateMfa(principal.id, body);
  }

  /** Turns MFA off. Requires a current code, so a session alone is not enough. */
  @Post('mfa/disable')
  @UseGuards(AdminAuthGuard)
  @HttpCode(200)
  async disableMfa(
    @Body(new ZodValidationPipe(AdminMfaDisableSchema)) body: AdminMfaDisableInput,
    @AdminUser() principal: AdminPrincipal,
  ): Promise<AdminMfaDisableView> {
    return this.auth.disableMfa(principal.id, body);
  }

  /** Rotates an admin refresh token. */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodValidationPipe(AdminRefreshSchema)) body: AdminRefreshInput,
  ): Promise<AdminTokenPair> {
    const rotated = await this.auth.refresh(body.refresh_token);

    if (!rotated) {
      // Unknown, expired, revoked and replayed are indistinguishable on purpose:
      // separating them would confirm that a given token once existed.
      throw new UnauthorizedException('Invalid refresh token');
    }

    return rotated;
  }

  /** Revokes the presented admin refresh token; other sessions stay signed in. */
  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodValidationPipe(AdminRefreshSchema)) body: AdminRefreshInput): Promise<void> {
    await this.auth.logout(body.refresh_token);
  }
}
