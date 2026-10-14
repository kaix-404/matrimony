import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import {
  RecommendationsQuerySchema,
  type AccessTokenClaims,
  type RecommendationsQuery,
  type RecommendationsResponse,
} from '@matrimony/shared';
import { RecommendationService } from './recommendation.service';

/**
 * The 'For You' feed (client answer 3: a separate tab).
 *
 * Separate from `GET /discovery` so the existing feed cannot regress, and scoped
 * to the caller from their saved preferences exactly as discovery is. The
 * feature flag (answer 7) is applied in the service; when off the route still
 * answers, with `enabled: false`.
 */
@Controller('recommendations')
@UseGuards(JwtAuthGuard)
export class RecommendationController {
  constructor(private readonly recommendations: RecommendationService) {}

  @Get()
  async forYou(
    @AuthUser() claims: AccessTokenClaims,
    @Query(new ZodValidationPipe(RecommendationsQuerySchema)) query: RecommendationsQuery,
  ): Promise<RecommendationsResponse> {
    return this.recommendations.forYou(claims.sub, query);
  }
}
