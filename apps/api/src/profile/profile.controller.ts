import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PhotoService } from './photo.service';
import { ProfileService } from './profile.service';
import { ProfileVisibility } from '../prisma/prisma-client';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import {
  CreateProfileSchema,
  UpdateProfileSchema,
  type AccessTokenClaims,
  type CreateProfileInput,
  type MyProfile,
  type ProfileCompleteness,
  type UpdateProfileInput,
} from '@matrimony/shared';
import {
  CompletePhotoUploadSchema,
  InitiatePhotoUploadSchema,
  SetVisibilitySchema,
  type CompletePhotoUploadInput,
  type InitiatePhotoUploadInput,
  type SetVisibilityInput,
} from './dto.js';

/**
 * The caller's own profile.
 *
 * Every route is behind the access guard and every handler derives its target
 * from the token's subject rather than a path or body id. There is no
 * `/profile/:id` here on purpose: an endpoint that takes a user id in the path
 * is one missing ownership check away from serving one person's profile to
 * another. Someone else's profile is served by discovery (Phase 3), which is
 * where the paid/locked distinction belongs.
 */
@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly photos: PhotoService,
  ) {}

  /** The full record, including the caller's own category, read-only. */
  @Get()
  async me(@AuthUser() claims: AccessTokenClaims): Promise<MyProfile> {
    return this.profiles.myProfile(claims.sub);
  }

  /** Which section 8 fields are still outstanding. */
  @Get('completeness')
  async completeness(@AuthUser() claims: AccessTokenClaims): Promise<ProfileCompleteness> {
    return this.profiles.completeness(claims.sub);
  }

  @Post()
  @HttpCode(201)
  async create(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(CreateProfileSchema)) body: CreateProfileInput,
  ): Promise<MyProfile> {
    return this.profiles.create(claims.sub, body);
  }

  /**
   * Partial update. Absent fields are left alone; `null` clears one. See
   * `ProfileService.update` for why that distinction is load-bearing.
   */
  @Patch()
  async update(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfileInput,
  ): Promise<MyProfile> {
    return this.profiles.update(claims.sub, body);
  }

  /** Pause or resume the caller's own visibility (section 12). */
  @Patch('visibility')
  async visibility(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(SetVisibilitySchema)) body: SetVisibilityInput,
  ): Promise<MyProfile> {
    return this.profiles.setVisibility(claims.sub, body.visibility as ProfileVisibility);
  }

  // -- photos (section 9) ----------------------------------------------------

  /**
   * Reserves an upload and returns a presigned PUT.
   *
   * `HIDDEN` is not offered: the client has not answered GAP-5/E5 on paywalled
   * placement, and a photo that starts hidden would need its own separate
   * mechanism. Adding it later is an enum change; offering it now would be
   * inventing product behaviour.
   */
  @Post('photos/upload')
  @HttpCode(201)
  async initiateUpload(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(InitiatePhotoUploadSchema)) body: InitiatePhotoUploadInput,
  ) {
    return this.photos.initiate(claims.sub, body);
  }

  /** Confirms the upload; the photo stays PENDING_REVIEW until moderated. */
  @Post('photos/complete')
  @HttpCode(200)
  async completeUpload(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(CompletePhotoUploadSchema)) body: CompletePhotoUploadInput,
  ): Promise<MyProfile['photos']> {
    return this.photos.complete(claims.sub, body);
  }

  @Get('photos')
  async listPhotos(@AuthUser() claims: AccessTokenClaims): Promise<MyProfile['photos']> {
    return this.photos.listOwn(claims.sub);
  }

  @Patch('photos/:photoId/primary')
  async setPrimary(
    @AuthUser() claims: AccessTokenClaims,
    @Param('photoId') photoId: string,
  ): Promise<MyProfile['photos']> {
    return this.photos.setPrimary(claims.sub, photoId);
  }

  @Delete('photos/:photoId')
  @HttpCode(204)
  async removePhoto(
    @AuthUser() claims: AccessTokenClaims,
    @Param('photoId') photoId: string,
  ): Promise<void> {
    await this.photos.remove(claims.sub, photoId);
  }
}
