import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { VerificationGateway } from '../verification/verification.gateway';
import { SmsGateway } from '../sms/sms.gateway';
import { EmailGateway } from '../email/email.gateway';
import { PushGateway } from '../push/push.gateway';

/** Which integrations are switched on, as the gateways themselves see it. */
export interface ProviderReadiness {
  identityVerification: boolean;
  sms: boolean;
  email: boolean;
  push: boolean;
}

const PROVIDERS: { name: string; key: keyof ProviderReadiness }[] = [
  { name: 'identity verification', key: 'identityVerification' },
  { name: 'sms', key: 'sms' },
  { name: 'email', key: 'email' },
  { name: 'push', key: 'push' },
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
 * Writes that line once at boot.
 *
 * The readiness route answers the same question, but only if someone is watching
 * at the right moment: a deploy is up for seconds before it is inspected, and the
 * question "was email on when that container started?" is asked days later, from
 * a Render log. This is the record it is asked against.
 *
 * Boot-time is enough because a gateway's `configured` flag is read from the
 * environment and cannot change while the process lives — a credential going in
 * is a redeploy, and a redeploy writes a new line.
 */
@Injectable()
export class ProviderReadinessReporter implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProviderReadinessReporter.name);

  constructor(
    private readonly verification: VerificationGateway,
    private readonly sms: SmsGateway,
    private readonly email: EmailGateway,
    private readonly push: PushGateway,
  ) {}

  onApplicationBootstrap(): void {
    this.logger.log(
      describeProviderReadiness({
        identityVerification: this.verification.configured,
        sms: this.sms.configured,
        email: this.email.configured,
        push: this.push.configured,
      }),
    );
  }
}
