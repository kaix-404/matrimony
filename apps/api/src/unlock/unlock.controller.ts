import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  type AccessTokenClaims,
  type ExpiredUnlockResponse,
  type LockedProfileResponse,
  type UnlockListResponse,
  type UnlockedProfileResponse,
} from '@matrimony/shared';
import { UnlockService } from './unlock.service';

/**
 * Section 17: contact is served no-store, so the app cannot hold a phone number
 * that is only licensed for the length of the unlock window.
 */
const UNLOCKED_CACHE_CONTROL = 'no-store';

/**
 * The caller's own unlocks.
 *
 * Section 15's "access remaining" surface. Scoped by the token subject: there is
 * no parameter naming whose unlocks to list.
 */
@Controller('unlocks')
@UseGuards(JwtAuthGuard)
export class UnlocksController {
  constructor(private readonly unlocks: UnlockService) {}

  @Get()
  list(@AuthUser() claims: AccessTokenClaims): Promise<UnlockListResponse> {
    return this.unlocks.listUnlocks(claims.sub);
  }
}

/**
 * Another user's profile, at whatever level of detail the caller has earned.
 *
 * Two response shapes, one route, decided server-side. A 403 would have been the
 * obvious choice and section 38 rules it out: the locked preview carries the
 * price the app needs to render the paywall, so a refusal would force the client
 * to reconstruct it from an error.
 */
@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(private readonly unlocks: UnlockService) {}

  /**
   * `@Res` with `passthrough` is used only to set a header conditionally. Nest
   * still serialises the returned value, so a future edit cannot accidentally
   * send an empty 200 by forgetting to write to the response object — which is
   * the usual way a handler that mixes `@Res` and return values goes wrong.
   */
  @Get(':id')
  async view(
    @AuthUser() claims: AccessTokenClaims,
    @Param('id') profileId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UnlockedProfileResponse | LockedProfileResponse | ExpiredUnlockResponse> {
    const result = await this.unlocks.view(claims.sub, profileId);

    // Only the unlocked shape is marked no-store. The locked preview is the same
    // payload the feed already serves and is safe to cache.
    if (result.profile_locked === false) {
      response.setHeader('Cache-Control', UNLOCKED_CACHE_CONTROL);
      // Some intermediaries cache a 200 that was cacheable upstream despite the
      // no-store above; Pragma is cheap insurance for a response containing a
      // phone number.
      response.setHeader('Pragma', 'no-cache');
    }

    return result;
  }
}
