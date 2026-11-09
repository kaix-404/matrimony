import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import {
  UpdatePartnerPreferenceSchema,
  type AccessTokenClaims,
  type PartnerPreferenceState,
  type UpdatePartnerPreferenceInput,
} from '@matrimony/shared';
import { PartnerPreferenceService } from './partner-preference.service';

/**
 * The caller's partner preferences, which narrow their own feed.
 *
 * Scoped to the caller like the visibility lists: a preference describes one
 * member's intent, and it has no meaning for anyone else. Reading another
 * member's preference would also hand over a slice of their private criteria.
 */
@Controller('me/partner-preference')
@UseGuards(JwtAuthGuard)
export class PartnerPreferenceController {
  constructor(private readonly preferences: PartnerPreferenceService) {}

  @Get()
  async get(@AuthUser() claims: AccessTokenClaims): Promise<PartnerPreferenceState> {
    return this.preferences.get(claims.sub);
  }

  /**
   * Replaces the whole preference.
   *
   * PUT, unlike the visibility lists' PATCH: this form always submits every
   * field, and clearing one is an edit the member expects to keep. A partial
   * update could not tell "remove the religion filter" from "did not mention
   * religion", which would make a cleared field quietly resurface.
   */
  @Put()
  async save(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(UpdatePartnerPreferenceSchema)) body: UpdatePartnerPreferenceInput,
  ): Promise<PartnerPreferenceState> {
    return this.preferences.save(claims.sub, body);
  }
}
