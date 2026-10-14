import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OtpService } from './otp.service';
import { RegistrationService } from './registration.service';
import { TokenService, parseDurationSeconds } from './token.service';
import { SmsModule } from '../sms/sms.module';
import type { Env } from '../config/env';

/**
 * The access secret is the only one configured here.
 *
 * Refresh tokens are opaque random strings, not JWTs, so they are verified by a
 * hashed database lookup rather than by signature — which is exactly what makes
 * revocation and reuse detection possible. Only one signing key is therefore
 * needed, and `JWT_REFRESH_SECRET` is not wired into this module by design.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: ['ENV'],
      useFactory: (env: Env) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: {
          // The TTL arrives as a string such as `15m` because that is how it is
          // configured, but jsonwebtoken's types only accept a number of seconds.
          // Parsing it here, once, keeps the string form out of the rest of the
          // codebase and keeps `expires_in` in the response consistent with the
          // token that was actually signed.
          expiresIn: parseDurationSeconds(env.JWT_ACCESS_TTL),
        },
      }),
    }),
    SmsModule,
  ],
  controllers: [AuthController],
  providers: [OtpService, TokenService, RegistrationService, AuthService, JwtAuthGuard],
  // `OtpService` is exported for account deletion (section 21), which has to
  // consume the DELETE_ACCOUNT code itself rather than having `otp/verify`
  // spend it — see the branch in `AuthController.verifyOtp`.
  //
  // `JwtModule` is exported so feature modules that must verify a token their own
  // way — the admin module issues `admin_access` tokens — share one signing
  // configuration instead of registering a second JwtModule against the same
  // secret and risking the two drifting apart.
  exports: [TokenService, RegistrationService, OtpService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
