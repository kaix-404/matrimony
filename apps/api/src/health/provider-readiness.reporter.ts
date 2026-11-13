import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { VerificationGateway } from '../verification/verification.gateway';
import { SmsGateway } from '../sms/sms.gateway';
import { EmailGateway } from '../email/email.gateway';
import { PushGateway } from '../push/push.gateway';
import { PaymentGateway } from '../payments/payment.gateway';
import { FeatureFlagsService } from '../common/features/feature-flags.service';

/** Which integrations are switched on, as the gateways themselves see it. */
export interface ProviderReadiness {
  identityVerification: boolean;
  sms: boolean;
  email: boolean;
  push: boolean;
  payments: boolean;
  /** Listed separately: a charge that cannot be confirmed grants nothing. */
  paymentWebhooks: boolean;
}

const PROVIDERS: { name: string; key: keyof ProviderReadiness }[] = [
  { name: 'identity verification', key: 'identityVerification' },
  { name: 'sms', key: 'sms' },
  { name: 'email', key: 'email' },
  { name: 'push', key: 'push' },
  { name: 'payments', key: 'payments' },
  { name: 'payment webhooks', key: 'paymentWebhooks' },
];

/**
 * One line naming the providers that are on and the ones still waiting on keys.
 *
 * Pure and separate from the logger so the wording is testable without capturing
 * log output. The two lists are printed as names rather than as flags because
 * this line is read by a person looking at a deploy log, usually while asking
 * "did the client's credentials go in?".
 */
export function describeProviderReadiness(readiness: ProviderReadiness): string {
  const configured = PROVIDERS.filter(({ key }) => readiness[key]).map(({ name }) => name);
  const awaiting = PROVIDERS.filter(({ key }) => !readiness[key]).map(({ name }) => name);

  if (awaiting.length === 0) {
    return `Providers all configured: ${configured.join(', ')}.`;
  }
  if (configured.length === 0) {
    return `Providers awaiting credentials: ${awaiting.join(', ')}.`;
  }
  return `Providers configured: ${configured.join(', ')}. Awaiting credentials: ${awaiting.join(', ')}.`;
}

/**
 * Writes what this deployment is actually switched on for, once at boot: the
 * providers, then the feature flags.
 *
 * The readiness route answers the same question about providers, but only while
 * someone is watching — "was email on when that build went out?" is usually asked
 * days later, from a Render log. The flag line exists for the same reason and
 * closed a real gap: the recommendations flag was claimed as a 10% rollout while
 * the deployment declared nothing at all, and no surface anywhere could settle it.
 *
 * Boot-time is enough because both come from the environment: a credential or a
 * flag change is a redeploy, and every redeploy writes fresh lines.
 */
@Injectable()
export class ProviderReadinessReporter implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProviderReadinessReporter.name);

  constructor(
    private readonly verification: VerificationGateway,
    private readonly sms: SmsGateway,
    private readonly email: EmailGateway,
    private readonly push: PushGateway,
    private readonly payments: PaymentGateway,
    private readonly flags: FeatureFlagsService,
  ) {}

  onApplicationBootstrap(): void {
    this.logger.log(
      describeProviderReadiness({
        identityVerification: this.verification.configured,
        sms: this.sms.configured,
        email: this.email.configured,
        push: this.push.configured,
        payments: this.payments.configured,
        paymentWebhooks: this.payments.webhookConfigured,
      }),
    );
    this.logger.log(`Feature flags: recommendations ${this.flags.describe('aiRecommendations')}.`);
  }
}
