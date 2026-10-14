import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { Env } from '../../config/env';

/**
 * The set of flags this build understands.
 *
 * A closed union rather than free-form strings so a typo is a compile error and
 * every flag has exactly one home. Flags are read once at boot, matching how the
 * rest of the config is parsed — a flag is a deployment decision, not per-request
 * state.
 */
export type FeatureFlag = 'aiRecommendations';

/**
 * Environment-backed feature flags (client answer 7: feature flag + gradual
 * rollout).
 *
 * Deliberately trivial. The point is not the storage but that a product area can
 * be dark by default and switched on per environment without a release, and that
 * callers go through one place rather than reading `process.env` ad hoc — which
 * is how a flag ends up checked in one branch and forgotten in another.
 */
@Injectable()
export class FeatureFlagsService {
  private readonly flags: Record<FeatureFlag, boolean>;

  constructor(@Inject('ENV') env: Env) {
    this.flags = { aiRecommendations: env.FEATURE_AI_RECOMMENDATIONS };
  }

  isEnabled(flag: FeatureFlag): boolean {
    return this.flags[flag] ?? false;
  }
}

@Global()
@Module({
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
