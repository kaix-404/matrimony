import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { RegistrationService } from './registration.service';
import { TokenService } from './token.service';
import { PrismaClient } from '../prisma/prisma-client';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import {
  CompleteRegistrationSchema,
  RefreshSchema,
  RequestOtpSchema,
  VerifyOtpSchema,
  type AccessTokenClaims,
  type CompleteRegistrationInput,
  type CurrentUser,
  type OtpRequested,
  type RequestOtpInput,
  type TokenPair,
  type VerifyOtpInput,
} from '@matrimony/shared';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly registration: RegistrationService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * Requests an OTP.
   *
   * The response is identical whether or not the number is registered, so this
   * endpoint cannot be used to enumerate users. Outside production the code is
   * echoed back: the SMS provider is undecided (GAP-12) and there is otherwise
   * no way to exercise the flow without a provider account.
   */
  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(
    @Body(new ZodValidationPipe(RequestOtpSchema)) body: RequestOtpInput,
  ): Promise<OtpRequested & { dev_code?: string }> {
    await this.otp.assertNotCoolingDown(body.mobile, body.purpose);
    const issued = await this.otp.issue({
      mobile: body.mobile,
      purpose: body.purpose,
      deviceId: body.device_id,
    });

    const response: OtpRequested & { dev_code?: string } = {
      message: 'If an account exists for this number, a verification code has been sent.',
      resend_after_seconds: this.otp.cooldownSeconds,
      expires_in_seconds: this.otp.ttlSeconds,
    };

    if (process.env.NODE_ENV !== 'production') {
      response.dev_code = issued.code;
    }

    return response;
  }

  /**
   * Verifies an OTP.
   *
   * REGISTRATION does not return tokens: completing registration also needs a
   * net-worth category, which `POST /auth/register` supplies. Issuing a session
   * here would mean a usable account that has no category, and `User`'s
   * category column is non-null by design.
   */
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(
    @Body(new ZodValidationPipe(VerifyOtpSchema)) body: VerifyOtpInput,
  ): Promise<{ verified: boolean; registration_required?: boolean; tokens?: TokenPair }> {
    const verified = await this.otp.verify(body);

    if (!verified) {
      return { verified: false };
    }

    if (body.purpose === 'REGISTRATION') {
      return { verified: true, registration_required: true };
    }

    const tokens = await this.auth.signIn(body.mobile);

    return tokens ? { verified: true, tokens } : { verified: true };
  }

  /**
   * Completes registration for a number whose OTP was verified.
   *
   * Requires that verification to exist for this exact number. Without the
   * check, anyone could register a number they were never sent a code for, and
   * the account would be indistinguishable from a real one until the first login
   * failed.
   */
  @Post('register')
  @HttpCode(201)
  async register(
    @Body(new ZodValidationPipe(CompleteRegistrationSchema)) body: CompleteRegistrationInput,
  ): Promise<TokenPair & { user: CurrentUser }> {
    const verified = await this.prisma.otpRequest.findFirst({
      where: { mobile: body.mobile, purpose: 'REGISTRATION', status: 'VERIFIED' },
      orderBy: { verifiedAt: 'desc' },
      select: { id: true },
    });

    if (!verified) {
      throw new UnauthorizedException('Verify your mobile number before registering');
    }

    const { userId } = await this.registration.complete(body);
    const tokens = await this.tokens.issueRefreshToken(userId);
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, status: true, networthCategory: true },
    });

    return {
      access_token: await this.tokens.issueAccessToken(account),
      refresh_token: tokens.token,
      token_type: 'Bearer',
      expires_in: this.tokens.accessTtlSeconds(),
      user: await this.registration.currentUser(userId),
    };
  }

  /** Exchanges a refresh token for a new pair. */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodValidationPipe(RefreshSchema)) body: { refresh_token: string },
  ): Promise<TokenPair> {
    const rotated = await this.tokens.rotate(body.refresh_token);

    if (!rotated) {
      // Unknown, expired, revoked and replayed all produce the same response.
      // Separating them would confirm that a given token once existed.
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      access_token: rotated.accessToken,
      refresh_token: rotated.refreshToken,
      token_type: 'Bearer',
      expires_in: rotated.expiresIn,
    };
  }

  /** Revokes the presented refresh token; other devices remain signed in. */
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(RefreshSchema)) body: { refresh_token: string },
  ): Promise<void> {
    await this.tokens.revoke(body.refresh_token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@AuthUser() claims: AccessTokenClaims): Promise<CurrentUser> {
    return this.registration.currentUser(claims.sub);
  }
}
