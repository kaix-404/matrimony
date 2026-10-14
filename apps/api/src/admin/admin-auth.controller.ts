import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import {
  AdminLoginSchema,
  AdminRefreshSchema,
  type AdminLoginInput,
  type AdminRefreshInput,
  type AdminTokenPair,
} from '@matrimony/shared';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AdminAuthService } from './admin-auth.service';

/**
 * Administrator authentication.
 *
 * This controller is deliberately NOT guarded: it is where an administrator
 * obtains the token that every guarded admin route requires. It is also a
 * separate controller from `AdminController` rather than an unguarded handler
 * inside it, because `AdminController` carries class-level guards and an
 * exemption there would be one line away from silently disabling RBAC on a real
 * endpoint.
 */
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  /** Exchanges email and password for an admin token pair. */
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(AdminLoginSchema)) body: AdminLoginInput): Promise<AdminTokenPair> {
    return this.auth.login(body);
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
