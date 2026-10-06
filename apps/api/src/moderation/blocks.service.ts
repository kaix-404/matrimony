import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { BlockedListResponse, BlockedProfile, BlockResult, PreviewPhoto } from '@matrimony/shared';
import { PrismaClient, PhotoStatus, UserStatus } from '../prisma/prisma-client';
import { StorageService } from '../storage/s3.service';
import { isLiveProfile } from './profile-visibility';

/** The subset of a photo row the block entry needs. */
interface PhotoRow {
  id: string;
  objectKey: string;
  widthPx: number;
  heightPx: number;
  isPrimary: boolean;
  photoType: string;
}

/**
 * Same projection discovery and unlock use, so one profile shows one photo.
 *
 * Deliberately not `as const`: a whole-object `const` assertion makes `orderBy`
 * a readonly tuple, which Prisma's generated input rejects as immutable.
 */
const APPROVED_PHOTOS = {
  where: { status: PhotoStatus.APPROVED },
  orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
  take: 1,
  select: {
    id: true,
    objectKey: true,
    widthPx: true,
    heightPx: true,
    isPrimary: true,
    photoType: true,
  },
};

/**
 * Section 19 — block and unblock.
 *
 * The interesting property is that nothing here does any filtering work. Both
 * read paths already exclude a blocked pair: discovery joins
 * `blocksInitiated`/`blockedBy` on every feed query, and `UnlockService.view`
 * checks the same pair before it decides what a profile is worth. A block row
 * therefore takes effect on the very next request with no cache to invalidate
 * and no flag to propagate — which is why this module can stay this small.
 *
 * The block itself is stored between the two `User` rows, not against the
 * profile. A profile id is only the handle the caller holds; the relationship
 * that matters for hiding is account-to-account, and it has to survive a profile
 * being rewritten.
 */
@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
  ) {}

  /**
   * Records a block. Repeating it is not an error: the row already exists, and
   * a caller retrying after a dropped connection must not be told it failed.
   */
  async block(viewerId: string, profileId: string): Promise<BlockResult> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        userId: true,
        deletedAt: true,
        user: {
          select: {
            networthCategory: true,
            deletedAt: true,
            isAnonymised: true,
            status: true,
          },
        },
        photos: APPROVED_PHOTOS,
      },
    });

    // A deleted, purged or never-existing profile answers exactly like a profile
    // the caller has no access to. Section 21 requires that a deleted profile
    // stop being reachable, and distinguishing "gone" from "not yours" would
    // turn blocking into an existence oracle.
    if (!isLiveProfile(profile)) {
      throw new NotFoundException('Profile not found');
    }

    // Section 12: "Profile IDs must not allow unauthorized cross-category
    // access." Blocking is the one write here that answers with a photo, so a
    // profile id harvested from the other band would otherwise be redeemable for
    // an image the caller's feed would never have shown them. The band is read
    // from the database rather than taken from `claims.cat`, because an admin
    // may have moved this user to another band since the token was signed.
    const viewer = await this.prisma.user.findUniqueOrThrow({
      where: { id: viewerId },
      select: { networthCategory: true },
    });

    if (viewer.networthCategory !== profile.user.networthCategory) {
      throw new NotFoundException('Profile not found');
    }

    if (profile.userId === viewerId) {
      throw new BadRequestException('You cannot block your own profile');
    }

    // `skipDuplicates` rather than a read-then-write: two concurrent blocks of
    // the same profile would otherwise race, and the loser's unique violation
    // would surface as a 500 on a request that succeeded.
    await this.prisma.blockedUser.createMany({
      data: [{ blockerId: viewerId, blockedId: profile.userId, isMutual: true }],
      skipDuplicates: true,
    });

    const row = await this.prisma.blockedUser.findUniqueOrThrow({
      where: { blockerId_blockedId: { blockerId: viewerId, blockedId: profile.userId } },
      select: { createdAt: true },
    });

    return {
      blocked: true,
      profile: await this.entry(profile.id, row.createdAt, profile.photos[0]),
    };
  }

  /**
   * Removes a block. Idempotent by design — an unblock of something that is not
   * blocked is the state the caller wanted, not a failure, and there is no
   * profile-existence check because a tombstone a user can no longer see still
   * deserves to be removable.
   */
  async unblock(viewerId: string, profileId: string): Promise<void> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { userId: true },
    });

    if (!profile) return;

    await this.prisma.blockedUser.deleteMany({
      where: { blockerId: viewerId, blockedId: profile.userId },
    });
  }

  /**
   * The caller's blocked list, newest first.
   *
   * Filtered to profiles that still identify someone: a profile that has been
   * deleted or an account whose PII was overwritten (section 21) contributes
   * nothing a person could act on, and serving it would mean minting a presigned
   * URL for an object that should no longer be reachable.
   *
   * There is no cursor. Blocks are accumulated one confirmation tap at a time,
   * so the list is bounded by effort in a way discovery never is, and paging
   * a Settings screen nobody scrolls is complexity with no user.
   */
  async list(viewerId: string): Promise<BlockedListResponse> {
    const rows = await this.prisma.blockedUser.findMany({
      where: {
        blockerId: viewerId,
        blocked: {
          deletedAt: null,
          isAnonymised: false,
          status: { not: UserStatus.DELETED },
          profile: { deletedAt: null },
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        blocked: {
          select: {
            profile: { select: { id: true, photos: APPROVED_PHOTOS } },
          },
        },
      },
    });

    const entries = await Promise.all(
      rows
        // A user with no profile row cannot be represented — and since blocks
        // are filed by profile id, that can only mean the profile was hard
        // deleted underneath an existing block.
        .filter((row) => row.blocked.profile !== null)
        .map((row) =>
          this.entry(
            row.blocked.profile!.id,
            row.createdAt,
            row.blocked.profile!.photos[0],
          ),
        ),
    );

    return { items: entries };
  }

  /**
   * One list entry, presigning at the last moment.
   *
   * A signing failure yields a null photo rather than throwing: the block is
   * still real and the user still needs to see the row. Section 38 forbids a
   * `url: null` reaching the app, so the failure collapses the whole photo
   * instead — the entry degrades to an unlabelled profile id, which is what the
   * caller already knows.
   */
  private async entry(
    profileId: string,
    blockedAt: Date,
    photo: PhotoRow | undefined,
  ): Promise<BlockedProfile> {
    if (!photo) {
      return { profile_id: profileId, photo: null, blocked_at: blockedAt.toISOString() };
    }

    const url = await this.storage.presignDownload(photo.objectKey).catch(() => null);

    if (!url) {
      return { profile_id: profileId, photo: null, blocked_at: blockedAt.toISOString() };
    }

    const signed: PreviewPhoto = {
      photo_id: photo.id,
      url,
      width_px: photo.widthPx,
      height_px: photo.heightPx,
      is_primary: photo.isPrimary,
      photo_type: photo.photoType as PreviewPhoto['photo_type'],
    };

    return { profile_id: profileId, photo: signed, blocked_at: blockedAt.toISOString() };
  }
}
