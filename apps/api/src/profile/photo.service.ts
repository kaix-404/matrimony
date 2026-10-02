import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StorageService } from '../storage/s3.service';
import { PhotoStatus, PhotoType, PrismaClient } from '../prisma/prisma-client';
import { ProfileService } from './profile.service';
import type { MyProfile } from '@matrimony/shared';

/** Section 9. */
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 6;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Photo upload — spec section 9, client decision D1.
 *
 * THREE STEPS, AND WHY
 * --------------------
 *   1. `initiate`  — the client states what it intends to upload. The API
 *                    reserves a row and returns a presigned PUT.
 *   2. the client PUTs the bytes straight to object storage.
 *   3. `complete`  — the client states the dimensions it saw, and the row goes
 *                    to PENDING_REVIEW.
 *
 * The bytes never pass through the API, so the app server never buffers an
 * unmoderated image and a 5 MB upload costs it nothing. The cost of that choice
 * is that the API cannot see the file, which is why `complete` trusts the
 * client's declared MIME type — and why the moderation worker, not this
 * service, is the thing that must check magic bytes before approval.
 *
 * Magic-byte checking here would be theatre: the file is not available to this
 * process, so any "check" would be re-reading the client's own claim. The
 * schema comment on `ProfilePhoto.checksum` says the same thing.
 */
@Injectable()
export class PhotoService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly profiles: ProfileService,
  ) {}

  /** Reserves an upload slot and returns the presigned PUT. */
  async initiate(
    userId: string,
    input: { mime_type: string; byte_size: number; photo_type: PhotoType },
  ): Promise<{ upload_url: string; object_key: string; expires_in_seconds: number }> {
    const profile = await this.requireProfile(userId);

    if (!ALLOWED_MIME.has(input.mime_type)) {
      // SVG is excluded on purpose: it is a script container, and serving one
      // from our own origin is stored XSS whatever the content type claims.
      throw new BadRequestException('Photo must be JPEG, PNG or WebP');
    }

    if (input.byte_size <= 0 || input.byte_size > MAX_BYTES) {
      throw new BadRequestException('Photo must be between 1 byte and 5 MB');
    }

    const count = await this.prisma.profilePhoto.count({
      where: { profileId: profile.id, status: { not: PhotoStatus.REJECTED } },
    });
    if (count >= MAX_PHOTOS) {
      throw new ConflictException(`A profile may hold at most ${MAX_PHOTOS} photos`);
    }

    const objectKey = `profiles/${profile.id}/${randomKey()}`;
    // PENDING_REVIEW from the moment the row exists: a photo is never visible
    // without an admin having seen it (section 9), so there is no window in
    // which an unmoderated upload is discoverable.
    const photo = await this.prisma.profilePhoto.create({
      data: {
        profileId: profile.id,
        objectKey,
        mimeType: input.mime_type,
        byteSize: input.byte_size,
        // Placeholders, replaced by `complete`. Non-null columns require
        // something here; a client that never calls complete leaves a row that
        // no endpoint serves, because nothing is approved and no bytes exist.
        widthPx: 0,
        heightPx: 0,
        photoType: input.photo_type,
        status: PhotoStatus.PENDING_REVIEW,
        sortOrder: count,
      },
      select: { objectKey: true },
    });

    const uploadUrl = await this.storage.presignUpload(
      photo.objectKey,
      input.mime_type,
      input.byte_size,
    );

    return { upload_url: uploadUrl, object_key: photo.objectKey, expires_in_seconds: 300 };
  }

  /**
   * Confirms the upload.
   *
   * The object key is returned by `initiate` and must match an existing row, so
   * a client cannot attach a photo it never registered — and in particular
   * cannot point at another profile's key.
   */
  async complete(
    userId: string,
    input: { object_key: string; width_px: number; height_px: number; checksum?: string },
  ): Promise<MyProfile['photos']> {
    const profile = await this.requireProfile(userId);

    const photo = await this.prisma.profilePhoto.findFirst({
      where: { objectKey: input.object_key, profileId: profile.id },
      select: { id: true },
    });

    if (!photo) {
      throw new NotFoundException('No upload was started for that key');
    }

    if (
      input.width_px <= 0 ||
      input.height_px <= 0 ||
      input.width_px > 20_000 ||
      input.height_px > 20_000
    ) {
      throw new BadRequestException('Photo dimensions are out of range');
    }

    await this.prisma.profilePhoto.update({
      where: { id: photo.id },
      data: {
        widthPx: input.width_px,
        heightPx: input.height_px,
        checksum: input.checksum ?? null,
      },
    });

    return this.listOwn(userId);
  }

  /** Makes one photo primary, demoting any previous primary in the same write. */
  async setPrimary(userId: string, photoId: string): Promise<MyProfile['photos']> {
    const profile = await this.requireProfile(userId);

    const photo = await this.prisma.profilePhoto.findFirst({
      where: { id: photoId, profileId: profile.id },
      select: { id: true },
    });
    if (!photo) throw new NotFoundException('Photo not found');

    await this.prisma.$transaction([
      this.prisma.profilePhoto.updateMany({
        where: { profileId: profile.id, isPrimary: true },
        data: { isPrimary: false },
      }),
      this.prisma.profilePhoto.update({ where: { id: photo.id }, data: { isPrimary: true } }),
    ]);

    return this.listOwn(userId);
  }

  /**
   * Deletes a photo row.
   *
   * The object itself is left to a later lifecycle sweep rather than deleted
   * here: a delete that fails halfway would either orphan the row or leave a
   * photo row pointing at nothing, and the sweep can retry. The row goes now so
   * the key is unreachable immediately, which is the part that matters for
   * privacy.
   */
  async remove(userId: string, photoId: string): Promise<void> {
    const profile = await this.requireProfile(userId);

    const photo = await this.prisma.profilePhoto.findFirst({
      where: { id: photoId, profileId: profile.id },
      select: { id: true, isPrimary: true },
    });
    if (!photo) throw new NotFoundException('Photo not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.profilePhoto.delete({ where: { id: photo.id } });

      if (photo.isPrimary) {
        // A profile with no primary would break "show the first photo" in
        // every card, so the next-oldest surviving photo is promoted.
        const next = await tx.profilePhoto.findFirst({
          where: { profileId: profile.id, status: { not: PhotoStatus.REJECTED } },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { id: true },
        });
        if (next) {
          await tx.profilePhoto.update({ where: { id: next.id }, data: { isPrimary: true } });
        }
      }
    });
  }

  async listOwn(userId: string): Promise<MyProfile['photos']> {
    const profile = await this.requireProfile(userId);
    return this.profiles.ownPhotos(profile.id);
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }
}

function randomKey(): string {
  // 128 bits of key randomness: enough that a key cannot be guessed from
  // another, and no path traversal is possible because the character set is
  // fixed alphanumeric.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
