import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  BlockProfileSchema,
  type AccessTokenClaims,
  type BlockedListResponse,
  type BlockProfileRequest,
  type BlockResult,
} from '@matrimony/shared';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { BlocksService } from './blocks.service';

/**
 * Section 19 — block, unblock, and the blocked list behind Settings.
 *
 * Every route is scoped by the token subject, never by a path parameter naming
 * whose blocks to read or write: "blocked profiles" is per-account data, so a
 * route of the form `/blocks/:userId` would only ever be a way to ask for
 * somebody else's list.
 */
@Controller('blocks')
@UseGuards(JwtAuthGuard)
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  /**
   * Blocks a profile.
   *
   * 201 whether or not the block already existed. The state is identical from
   * the app's side — it shows "blocked" either way — and an endpoint that
   * answered 409 on a retry would turn a recovered connection into an error
   * screen for a user who successfully blocked someone.
   */
  @Post()
  create(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(BlockProfileSchema)) body: BlockProfileRequest,
  ): Promise<BlockResult> {
    return this.blocks.block(claims.sub, body.profile_id);
  }

  /** 204 on an unknown profile as well as a known one; see `unblock`. */
  @Delete(':profileId')
  @HttpCode(204)
  remove(
    @AuthUser() claims: AccessTokenClaims,
    @Param('profileId') profileId: string,
  ): Promise<void> {
    return this.blocks.unblock(claims.sub, profileId);
  }

  @Get()
  list(@AuthUser() claims: AccessTokenClaims): Promise<BlockedListResponse> {
    return this.blocks.list(claims.sub);
  }
}
