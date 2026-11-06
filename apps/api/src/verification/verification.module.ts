import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import { CashfreeVerificationGateway, VerificationGateway } from './verification.gateway';
import type { Env } from '../config/env';

/**
 * Identity verification (D9).
 *
 * `AuthModule` is imported for `TokenService`, which `JwtAuthGuard` needs to
 * verify the bearer token on `initiate` and `status`. Nest scopes providers per
 * module: a guard whose module cannot reach the one exporting `TokenService`
 * fails at bootstrap, not at request time.
 *
 * The gateway is bound to the abstract class rather than to the Cashfree
 * implementation so the service cannot reach the vendor client directly, and so
 * a test can substitute a gateway without the network.
 */
@Module({
  imports: [AuthModule],
  controllers: [VerificationController],
  providers: [
    VerificationService,
    {
      provide: VerificationGateway,
      inject: ['ENV'],
      useFactory: (env: Env): VerificationGateway =>
        new CashfreeVerificationGateway(
          env.CASHFREE_CLIENT_ID,
          env.CASHFREE_CLIENT_SECRET,
          env.CASHFREE_ENVIRONMENT,
        ),
    },
  ],
  exports: [VerificationService],
})
export class VerificationModule {}
