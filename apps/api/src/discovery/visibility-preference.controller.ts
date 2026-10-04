import { Body, Controller, Get, Patch, UseGuards, BadRequestException } from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import {
  NetWorthVisibilityPreferenceSchema,
  type AccessTokenClaims,
  type NetWorthVisibilityPreference,
  type NetWorthVisibilityPreferenceState,
} from '@matrimony/shared';
import { UnknownCategoryError, VisibilityPreferenceService } from './visibility-preference.service';

/**
 * The caller's own two-way visibility preferences.
 *
 * Authenticated, and deliberately scoped to the caller: these lists decide who
 * can see whom, so reading or writing someone else's is itself a disclosure.
 */
@Controller('me/visibility')
@UseGuards(JwtAuthGuard)
export class VisibilityPreferenceController {
  constructor(private readonly preferences: VisibilityPreferenceService) {}

  @Get()
  async get(@AuthUser() claims: AccessTokenClaims): Promise<NetWorthVisibilityPreferenceState> {
    return this.preferences.getState(claims.sub);
  }

  /**
   * Saves one or both lists.
   *
   * PATCH rather than PUT because both directions are independently editable:
   * submitting only `discover` must leave `visible_to` as it was. A whole-resource
   * replacement would let a client that only meant to change one side silently
   * reset the other, changing who can see the user without their intent.
   */
  @Patch()
  async save(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(NetWorthVisibilityPreferenceSchema))
    body: Partial<NetWorthVisibilityPreference>,
  ): Promise<NetWorthVisibilityPreferenceState> {
    try {
      return await this.preferences.save(claims.sub, body);
    } catch (error) {
      if (error instanceof UnknownCategoryError) {
        // 400 naming the offending keys. A generic failure would leave the app
        // unable to tell the user which option is wrong, and the server's list of
        // active bands may have moved since the client cached it.
        throw new BadRequestException({
          message: 'Unknown or unavailable net-worth category',
          categories: error.keys,
        });
      }
      throw error;
    }
  }
}