import { Logger } from '@nestjs/common';
import {
  describeProviderReadiness,
  ProviderReadinessReporter,
} from './provider-readiness.reporter';
import type { VerificationGateway } from '../verification/verification.gateway';
import type { SmsGateway } from '../sms/sms.gateway';
import type { EmailGateway } from '../email/email.gateway';
import type { PushGateway } from '../push/push.gateway';

/**
 * The boot line is how a deploy is checked after the fact, so it has to name what
 * is missing rather than print four booleans a reader has to decode.
 */
describe('describeProviderReadiness', () => {
  it('lists the providers that are on and the ones still waiting', () => {
    expect(
      describeProviderReadiness({
        identityVerification: true,
        sms: true,
        email: false,
        push: true,
      }),
    ).toBe('Providers configured: identity verification, sms, push. Awaiting credentials: email.');
  });

  it('says so plainly when everything is configured', () => {
    expect(
      describeProviderReadiness({
        identityVerification: true,
        sms: true,
        email: true,
        push: true,
      }),
    ).toBe('Providers all configured: identity verification, sms, email, push.');
  });

  it('says so plainly when nothing is configured', () => {
    expect(
      describeProviderReadiness({
        identityVerification: false,
        sms: false,
        email: false,
        push: false,
      }),
    ).toBe('Providers awaiting credentials: identity verification, sms, email, push.');
  });
});

describe('ProviderReadinessReporter', () => {
  it('logs exactly one line at boot, holding the gateway state', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const reporter = new ProviderReadinessReporter(
      { configured: true } as VerificationGateway,
      { configured: false } as SmsGateway,
      { configured: false } as EmailGateway,
      { configured: true } as PushGateway,
    );

    reporter.onApplicationBootstrap();

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      'Providers configured: identity verification, push. Awaiting credentials: sms, email.',
    );
    log.mockRestore();
  });
});
