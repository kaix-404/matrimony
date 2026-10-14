import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';

/**
 * AI profile recommendations.
 *
 * Imports `DiscoveryModule` to reuse `DiscoveryService` — the recommendation
 * query spreads the same eligibility/visibility predicate, so a recommendation
 * cannot surface a profile discovery would withhold. Imports `AuthModule` for
 * the access guard, as every authenticated controller does.
 *
 * `FeatureFlagsService` needs no import — `FeatureFlagsModule` is global.
 */
@Module({
  imports: [AuthModule, DiscoveryModule],
  controllers: [RecommendationController],
  providers: [RecommendationService],
})
export class RecommendationModule {}
