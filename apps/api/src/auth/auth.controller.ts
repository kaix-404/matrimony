import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  ServiceUnavailableException,
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
import { SmsGateway } from '../sms/sms.gateway';
import {
  CompleteRegistrationSchema,
  RefreshSchema,
  RequestOtpSchema,
  SMS_UNAVAILABLE_CODE,
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
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly registration: RegistrationService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaClient,
    private readonly sms: SmsGateway,
  ) {}

  /**
   * Requests an OTP.
   *
   * The response is identical whether or not the number is registered, so this
   * endpoint cannot be used to enumerate users.
   *
   * The code is sent via MSG91 whenever the gateway is configured, in
   * development as well as production, so a local run exercises the real
   * delivery path instead of only the echo. The echo still exists: in
   * development it is returned when MSG91 is not configured, or when a send is
   * rejected — a developer must not be stranded at the OTP screen because a
   * provider refused a template. In production neither escape is available: an
   * unconfigured gateway fails closed, and a failed send surfaces, because a
   * code that never left the vendor must not look as though it was sent.
   *
   * A failed send in production is answered `503` with `SMS_UNAVAILABLE` rather
   * than a faceless 500: "we did not text you" is something a person can act on
   * (retry shortly), while a generic failure reads like their number is wrong.
   * One code covers every cause — a rejected template, an outage, an unfunded
   * wallet — because the user's situation is the same in all of them and the
   * difference belongs in the log, not on their screen.
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

    const isProduction = process.env.NODE_ENV === 'production';

    // Checked before any send so production still fails closed on a gateway
    // that was never configured.
    if (isProduction && !this.sms.configured) {
      throw new UnauthorizedException('SMS provider is not configured');
    }

    if (!this.sms.configured) {
      response.dev_code = issued.code;
    } else {
      try {
        const delivery = await this.sms.sendOtp({ mobile: body.mobile, code: issued.code });

        // MSG91 accepted the send, but its own balance endpoint disagrees with
        // the account holder about whether it could. Say so in development
        // while the code is still echoed, so the mismatch is visible. Never in
        // production: a user cannot act on an unverifiable figure, and the send
        // was accepted, so the honest answer there is still "we sent it".
        if (delivery.reportedZeroBalance && !isProduction) {
          response.delivery_warning =
            'MSG91 reports a zero SMS balance, so this message may not arrive. ' +
            'Use the development code below, and check delivery in the MSG91 panel.';
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);

        if (isProduction) {
          // Coded so the app can pick copy that makes sense on a phone; the
          // vendor wording stays in the log, where an operator can act on it.
          this.logger.error(`OTP not sent: ${detail}`);
          throw new ServiceUnavailableException({
            statusCode: 503,
            code: SMS_UNAVAILABLE_CODE,
            message: 'SMS verification is temporarily unavailable; please try again shortly.',
          });
        }

        this.logger.warn(`MSG91 send failed; echoing dev_code instead: ${detail}`);
        response.dev_code = issued.code;
        // Without this the app shows a development code and looks like a
        // working send, which is how an unusable wallet hid for days.
        response.delivery_warning = `No message was sent (${detail}). Use the development code below.`;
      }
    }

    return response;
  }

  /**
   * Verifies an OTP.
   *
   * REGISTRATION and DELETE_ACCOUNT do not return tokens: both are steps in a
   * longer flow, and completing them also needs something else — a net-worth
   * category for registration, the deletion request itself for section 21.
   * Issuing a session here would mean a usable account with no category, or a
   * freshly renewed session handed to an account whose very next request
   * deletes it. Both codes are spent later, at the step that uses them.
   */
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(
    @Body(new ZodValidationPipe(VerifyOtpSchema)) body: VerifyOtpInput,
  ): Promise<{ verified: boolean; registration_required?: boolean; tokens?: TokenPair }> {
    const verified = await this.otp.verify(body);

    if (!verified) {
      // A wrong code against a known account is a brute-force attempt, not a
      // typo, so it feeds the lockout. Guarded on the account existing: counting
      // failures for a number with no account gives an attacker a way to lock
      // arbitrary numbers out of ever registering, which is a denial of service
      // they would otherwise have to pay to commit.
      if (body.purpose !== 'REGISTRATION') {
        await this.auth.recordFailedSignInForMobile(body.mobile);
      }

      return { verified: false };
    }

    if (body.purpose === 'REGISTRATION') {
      return { verified: true, registration_required: true };
    }

    // Section 21 re-authentication. Verified but deliberately not spent: the
    // deletion endpoint consumes it, and that is what binds the request to
    // somebody who holds the number. Spending it here would leave the caller
    // with a code that was already gone, and signing them in would mint a
    // session for an account that is about to be deleted.
    if (body.purpose === 'DELETE_ACCOUNT') {
      return { verified: true };
    }

    // Spent here rather than left available, for the same reason as the
    // registration code: a verified code is a session, and it must not be
    // redeemable twice.
    await this.otp.consumeVerified({ mobile: body.mobile, purpose: body.purpose });

    const tokens = await this.auth.signIn(body.mobile);

    return tokens ? { verified: true, tokens } : { verified: true };
  }

  /**
   * Completes registration for a number whose OTP was verified.
   *
   * The code is spent here, and spent once. Checking that "a verified code for
   * this number exists" is not enough on its own: registration is idempotent on
   * mobile and issues tokens whether the account already existed, so a code that
   * was never invalidated would let anyone who later learns the number obtain a
   * session for it. Consuming on use turns a verification into a single-use
   * grant for exactly this step.
   */
  @Post('register')
  @HttpCode(201)
  async register(
    @Body(new ZodValidationPipe(CompleteRegistrationSchema)) body: CompleteRegistrationInput,
  ): Promise<TokenPair & { user: CurrentUser }> {
    const consumed = await this.otp.consumeVerified({
      mobile: body.mobile,
      purpose: 'REGISTRATION',
    });

    if (!consumed) {
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
