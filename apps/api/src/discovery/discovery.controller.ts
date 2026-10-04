import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import {
  DiscoveryQuerySchema,
  type AccessTokenClaims,
  type DiscoveryQuery,
  type DiscoveryResponse,
} from '@matrimony/shared';
import { DiscoveryService } from './discovery.service';

/**
 * The discovery feed.
 *
 * Authenticated and strictly scoped to the caller: the scope is derived from
 * this user's saved visibility preferences, and there is no parameter that could
 * widen it. Section 12 requires that profile IDs not allow unauthorized
 * cross-category access, so a client cannot ask for another user's scope.
 */
@Controller('discovery')
@UseGuards(JwtAuthGuard)
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get()
  async search(
    @AuthUser() claims: AccessTokenClaims,
    @Query(new ZodValidationPipe(DiscoveryQuerySchema)) query: DiscoveryQuery,
  ): Promise<DiscoveryResponse> {
    return this.discovery.search(claims.sub, query);
  }
}