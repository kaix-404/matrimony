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
 * Environment-backed feature flags with optional percentage rollout (client
 * answer 7: feature flag + gradual rollout).
 *
 * A flag can be:
 * - `false` (disabled for everyone)
 * - `true` (enabled for everyone)
 * - a number 0-100 (enabled for that percentage of users, deterministically by user id)
 *
 * Deliberately trivial. The point is not the storage but that a product area can
 * be dark by default and switched on per environment without a release, and that
 * callers go through one place rather than reading `process.env` ad hoc — which
 * is how a flag ends up checked in one branch and forgotten in another.
 */
@Global()
@Injectable()
export class FeatureFlagsService {
  private readonly flags: Record<FeatureFlag, boolean | number>;

  constructor(@Inject('ENV') env: Env) {
    this.flags = { aiRecommendations: env.FEATURE_AI_RECOMMENDATIONS };
  }

  isEnabled(flag: FeatureFlag): boolean {
    return this.flags[flag] === true;
  }

  /**
   * Returns true for a percentage of users based on their id hash.
   * Percentage must be an integer 0-100.
   */
  isEnabledForUser(flag: FeatureFlag, userId: string): boolean {
    const value = this.flags[flag];
    if (value === true) return true;
    if (value === false) return false;
    if (typeof value === 'number' && value > 0) {
      // Deterministic hash of userId to 0-99
      let hash = 0;
      for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
      }
      const bucket = Math.abs(hash) % 100;
      return bucket < value;
    }
    return false;
  }
}

@Global()
@Module({
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
