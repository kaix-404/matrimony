import {
  BadRequestException,
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
import { EmailGateway } from '../email/email.gateway';
import {
  ChangeEmailSchema,
  ChangeMobileSchema,
  CompleteRegistrationSchema,
  EMAIL_UNAVAILABLE_CODE,
  RefreshSchema,
  RequestEmailOtpSchema,
  RequestOtpSchema,
  SMS_UNAVAILABLE_CODE,
  VerifyOtpSchema,
  type AccessTokenClaims,
  type ChangeEmailInput,
  type ChangeMobileInput,
  type CompleteRegistrationInput,
  type CurrentUser,
  type OtpRequested,
  type RequestEmailOtpInput,
  type RequestOtpInput,
  type TokenPair,
  type VerifyOtpInput,
} from '@matrimony/shared';

@Controller('auth')
export class AuthController {
  // A plain field rather than a constructor parameter: `Logger` is not a
  // provider in `AuthModule`, so injecting it made Nest refuse to boot.
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly registration: RegistrationService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaClient,
    private readonly sms: SmsGateway,
    private readonly email: EmailGateway,
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
        // The delivery result is deliberately not inspected for a zero balance:
        // MSG91's balance endpoint disagrees with the funded dashboard for this
        // account, and surfacing that reading stranded users behind a warning
        // about a wallet they cannot see. Accepted sends say nothing.
        await this.sms.sendOtp({ mobile: body.mobile, code: issued.code });
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
        // working send, which is how a broken send path hid for days.
        response.delivery_warning = 'No message was sent. Use the development code below.';
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

    // A number change is verified by the change endpoint itself, against the code
    // still pending. Answering here would consume that pending state (a wrong guess
    // burns an attempt, a right one marks it VERIFIED) and leave `/mobile/change`
    // with nothing to check, so this route refuses the purpose outright.
    if (body.purpose === 'CHANGE_MOBILE') {
      throw new BadRequestException('Complete the change with POST /auth/mobile/change');
    }

    // Same reason as the number change: the address is verified by the endpoint
    // that changes it, against the code still pending.
    if (body.purpose === 'CHANGE_EMAIL') {
      throw new BadRequestException('Complete the change with POST /auth/email/change');
    }

    // Spent here rather than left available, for the same reason as the
    // registration code: a verified code is a session, and it must not be
    // redeemable twice.
    await this.otp.consumeVerified({ mobile: body.mobile, purpose: body.purpose });

    const tokens = await this.auth.signIn(body.mobile);

    return tokens ? { verified: true, tokens } : { verified: true };
  }

  /**
   * Moves the signed-in account to a new mobile number.
   *
   * The code was requested with `POST /auth/otp/request` and purpose
   * `CHANGE_MOBILE`, sent to the number being moved to. A fresh token pair comes
   * back because every session authorised by the old number is revoked — including
   * this one — and the caller must not be signed out for having used the feature.
   */
  @Post('mobile/change')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async changeMobile(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(ChangeMobileSchema)) body: ChangeMobileInput,
  ): Promise<TokenPair> {
    return this.auth.changeMobile(claims.sub, body.mobile, body.code);
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
  /**
   * Sends a code to an address the signed-in member wants to add or move to.
   *
   * The account comes from the token, never the body: an endpoint that accepted
   * a user id would let any member attach their own mailbox to somebody else's
   * account.
   *
   * Whether the address is already taken is deliberately not answered here. The
   * answer would let any signed-in member test addresses against the user base
   * one at a time; the change endpoint answers it to somebody who has just proved
   * they can receive mail there, which is the same information registration gives
   * them.
   *
   * Delivery follows the SMS route exactly: MSG91 when configured, a development
   * echo when it is not, and a 503 in production either way if no message could
   * be sent.
   */
  @Post('email/otp')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async requestEmailOtp(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(RequestEmailOtpSchema)) body: RequestEmailOtpInput,
  ): Promise<OtpRequested & { dev_code?: string }> {
    const account = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { mobile: true, email: true },
    });
    if (account === null) {
      throw new UnauthorizedException('Sign in again to add an email address');
    }
    if (account.email === body.email) {
      throw new BadRequestException('That is already your email address');
    }

    await this.otp.assertNotCoolingDown(account.mobile, 'CHANGE_EMAIL', body.email);
    const issued = await this.otp.issue({
      mobile: account.mobile,
      purpose: 'CHANGE_EMAIL',
      email: body.email,
    });

    const response: OtpRequested & { dev_code?: string } = {
      message: 'A verification code has been sent to that address.',
      resend_after_seconds: this.otp.cooldownSeconds,
      expires_in_seconds: this.otp.ttlSeconds,
    };

    const isProduction = process.env.NODE_ENV === 'production';

    if (!this.email.configured) {
      if (isProduction) {
        this.logger.error('Email verification code not sent: MSG91 email is not configured');
        throw new ServiceUnavailableException({
          statusCode: 503,
          code: EMAIL_UNAVAILABLE_CODE,
          message: 'Email verification is temporarily unavailable; please try again shortly.',
        });
      }
      response.dev_code = issued.code;
      return response;
    }

    try {
      await this.email.sendOtp({ email: body.email, code: issued.code });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      if (isProduction) {
        this.logger.error(`Email verification code not sent: ${detail}`);
        throw new ServiceUnavailableException({
          statusCode: 503,
          code: EMAIL_UNAVAILABLE_CODE,
          message: 'Email verification is temporarily unavailable; please try again shortly.',
        });
      }

      this.logger.warn(`MSG91 email send failed; echoing dev_code instead: ${detail}`);
      response.dev_code = issued.code;
      response.delivery_warning = 'No email was sent. Use the development code below.';
    }

    return response;
  }

  /**
   * Completes the change with the code sent to the address.
   *
   * Returns the account as the app's `me` route does, so the profile screen can
   * show the new address without a second round trip.
   */
  @Post('email/change')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async changeEmail(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(ChangeEmailSchema)) body: ChangeEmailInput,
  ): Promise<CurrentUser> {
    await this.auth.changeEmail(claims.sub, body.email, body.code);
    return this.registration.currentUser(claims.sub);
  }

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
