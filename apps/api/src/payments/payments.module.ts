import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { ClockModule } from '../common/clock/clock.module';
import { AuthModule } from '../auth/auth.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { PaymentGateway, RazorpayPaymentGateway } from './payment.gateway';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import type { Env } from '../config/env';

/**
 * Payments (spec sections 14, 18, 27 and 40).
 *
 * `DiscoveryModule` is imported for one reason: buying an unlock must obey the
 * same two-way visibility scope as the feed that offered the profile. Reusing
 * `VisibilityPreferenceService` rather than re-deriving that scope here is what
 * keeps the two from disagreeing — an unlock endpoint with its own, looser
 * visibility check would be a paid way around section 12.
 *
 * `ClockModule` supplies server time, which section 15 makes mandatory for the
 * unlock window.
 *
 * `AuthModule` supplies `TokenService`, which `JwtAuthGuard` needs to verify the
 * bearer token on the three authenticated routes. Nest scopes providers per
 * module: a guard referenced by a controller whose module does not import the
 * one exporting `TokenService` fails to resolve at bootstrap, not at request
 * time.
 */
@Module({
  imports: [ConfigModule, ClockModule, AuthModule, DiscoveryModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      // Bound to the abstract class rather than to RazorpayPaymentGateway so
      // PaymentsService cannot reach the vendor SDK directly, and so a test can
      // substitute a gateway without the network.
      provide: PaymentGateway,
      inject: ['ENV'],
      useFactory: (env: Env): PaymentGateway =>
        new RazorpayPaymentGateway(
          env.RAZORPAY_KEY_ID,
          env.RAZORPAY_KEY_SECRET,
          env.RAZORPAY_WEBHOOK_SECRET,
        ),
    },
  ],
  // Exported for the unlock guard that section 17 requires on every protected
  // read, and for Phase 7's 2-hour expiry reminder.
  exports: [PaymentsService, PaymentGateway],
})
export class PaymentsModule {}
