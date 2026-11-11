import { Logger } from '@nestjs/common';
import {
  describeProviderReadiness,
  ProviderReadinessReporter,
} from './provider-readiness.reporter';
import { FeatureFlagsService } from '../common/features/feature-flags.service';
import type { Env } from '../config/env';
import type { VerificationGateway } from '../verification/verification.gateway';
import type { SmsGateway } from '../sms/sms.gateway';
import type { EmailGateway } from '../email/email.gateway';
import type { PushGateway } from '../push/push.gateway';

/**
 * The boot lines are how a deploy is checked after the fact, so they have to name
 * what is on and what is missing rather than print booleans a reader has to
 * decode — and they have to say it about the flags too, because a flag claimed in
 * a status report but absent from the deployment is exactly the confusion this
 * exists to prevent.
 */
function flagService(value: boolean | number): FeatureFlagsService {
  return new FeatureFlagsService({ FEATURE_AI_RECOMMENDATIONS: value } as unknown as Env);
}

interface GatewayState {
  identityVerification: boolean;
  sms: boolean;
  email: boolean;
  push: boolean;
}

function makeReporter(state: GatewayState, flags: FeatureFlagsService): ProviderReadinessReporter {
  return new ProviderReadinessReporter(
    { configured: state.identityVerification } as VerificationGateway,
    { configured: state.sms } as SmsGateway,
    { configured: state.email } as EmailGateway,
    { configured: state.push } as PushGateway,
    flags,
  );
}

const MIXED: GatewayState = { identityVerification: true, sms: true, email: false, push: true };
const ALL_ON: GatewayState = { identityVerification: true, sms: true, email: true, push: true };
const ALL_OFF: GatewayState = {
  identityVerification: false,
  sms: false,
  email: false,
  push: false,
};

describe('describeProviderReadiness', () => {
  it('lists the providers that are on and the ones still waiting', () => {
    expect(describeProviderReadiness(MIXED)).toBe(
      'Providers configured: identity verification, sms, push. Awaiting credentials: email.',
    );
  });

  it('says so plainly when everything is configured', () => {
    expect(describeProviderReadiness(ALL_ON)).toBe(
      'Providers all configured: identity verification, sms, email, push.',
    );
  });

  it('says so plainly when nothing is configured', () => {
    expect(describeProviderReadiness(ALL_OFF)).toBe(
      'Providers awaiting credentials: identity verification, sms, email, push.',
    );
  });
});

describe('ProviderReadinessReporter', () => {
  it('logs the provider state and the flag value at boot', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    makeReporter(
      { identityVerification: true, sms: false, email: false, push: true },
      flagService(false),
    ).onApplicationBootstrap();

    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenNthCalledWith(
      1,
      'Providers configured: identity verification, push. Awaiting credentials: sms, email.',
    );
    expect(log).toHaveBeenNthCalledWith(2, 'Feature flags: recommendations off.');
    log.mockRestore();
  });

  it('records a rollout as its percentage, not as "on"', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    makeReporter(ALL_ON, flagService(10)).onApplicationBootstrap();

    expect(log).toHaveBeenNthCalledWith(2, 'Feature flags: recommendations 10%.');
    log.mockRestore();
  });

  it('records a fully enabled flag as on', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    makeReporter(ALL_ON, flagService(true)).onApplicationBootstrap();

    expect(log).toHaveBeenNthCalledWith(2, 'Feature flags: recommendations on.');
    log.mockRestore();
  });
});
