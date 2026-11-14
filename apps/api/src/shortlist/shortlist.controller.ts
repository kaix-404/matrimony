import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  ShortlistProfileSchema,
  type AccessTokenClaims,
  type MatchesResponse,
  type ShortlistProfileRequest,
  type ShortlistIndex,
  type ShortlistResult,
  type ShortlistState,
} from '@matrimony/shared';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { ShortlistService } from './shortlist.service';

/**
 * Bookmarks, scoped to the token subject.
 *
 * There is no route naming whose list to read: a shortlist is per-account data,
 * so `/shortlist/:userId` would only ever be a way to ask for somebody else's.
 *
 * 201 whether or not the row already existed, for the same reason blocking is:
 * the member's list looks identical either way, and a 409 on a retried request
 * would turn a recovered connection into an error for an action that worked.
 */
@Controller('shortlist')
@UseGuards(JwtAuthGuard)
export class ShortlistController {
  constructor(private readonly shortlist: ShortlistService) {}

  @Post()
  add(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(ShortlistProfileSchema)) body: ShortlistProfileRequest,
  ): Promise<ShortlistResult> {
    return this.shortlist.add(claims.sub, body.profile_id);
  }

  /** The saved profile ids, for the feed's bookmark icons. */
  @Get()
  index(@AuthUser() claims: AccessTokenClaims): Promise<ShortlistIndex> {
    return this.shortlist.index(claims.sub);
  }

  /** Whether this one profile is bookmarked — the profile page's button state. */
  @Get(':profileId')
  state(
    @AuthUser() claims: AccessTokenClaims,
    @Param('profileId') profileId: string,
  ): Promise<ShortlistState> {
    return this.shortlist.state(claims.sub, profileId);
  }

  /** 204 on an unknown profile too; see `remove`. */
  @Delete(':profileId')
  @HttpCode(204)
  remove(
    @AuthUser() claims: AccessTokenClaims,
    @Param('profileId') profileId: string,
  ): Promise<void> {
    return this.shortlist.remove(claims.sub, profileId);
  }
}

/**
 * The Matches tab: shortlisted profiles and unlocked ones, as one list.
 *
 * Read-only and derived — there is no "add to matches" route, because what makes
 * a profile appear here is either a bookmark or a payment, and both already have
 * their own endpoint.
 */
@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MatchesController {
  constructor(private readonly shortlist: ShortlistService) {}

  @Get()
  list(@AuthUser() claims: AccessTokenClaims): Promise<MatchesResponse> {
    return this.shortlist.matches(claims.sub);
  }
}
