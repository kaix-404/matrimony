import { Injectable } from '@nestjs/common';
import {
  type MatchCard,
  type MatchesResponse,
  type PreviewPhoto,
  type ShortlistIndex,
  type ShortlistResult,
  type ShortlistState,
} from '@matrimony/shared';
import { PhotoStatus, PrismaClient } from '../prisma/prisma-client';
import { StorageService } from '../storage/s3.service';
import { UnlockService } from '../unlock/unlock.service';

/** The one photo a card shows; the same projection discovery and blocks use. */
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

interface PhotoRow {
  id: string;
  objectKey: string;
  widthPx: number;
  heightPx: number;
  isPrimary: boolean;
  photoType: string;
}

interface ProfileRow {
  id: string;
  firstName: string;
  lastName: string | null;
  status: string;
  visibility: string;
  deletedAt: Date | null;
  photos: PhotoRow[];
}

/**
 * Shortlisting, and the Matches list that combines it with the caller's paid
 * unlocks.
 *
 * A shortlist is a bookmark the caller owns: it reveals nothing new about the
 * profile it names, it is never visible to that profile, and it does not expire.
 * Unlocking is the opposite — a purchase with a window — so the two are stored
 * apart and only meet in the read below.
 *
 * Every write goes through `UnlockService.assertViewable`, which is the same
 * check a profile view runs: existence, approve/visibility state, blocks, and
 * the two-way discovery scope. Re-deriving that guard here would be the obvious
 * way to let a member bookmark a profile the feed would never show them, and the
 * card would then be a way to confirm such a profile exists.
 */
@Injectable()
export class ShortlistService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly unlocks: UnlockService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Bookmarks a profile. Idempotent: a second tap is the state the member
   * wanted, and the timestamp it answers with is the original one, so the list
   * order does not shuffle under a double tap.
   */
  async add(viewerId: string, profileId: string): Promise<ShortlistResult> {
    const target = await this.unlocks.assertViewable(viewerId, profileId);

    // `skipDuplicates` rather than read-then-write: two taps landing together
    // would otherwise race and the loser's unique violation would surface as a
    // 500 on a request that succeeded.
    await this.prisma.shortlist.createMany({
      data: [{ userId: viewerId, profileId: target.id }],
      skipDuplicates: true,
    });

    const row = await this.prisma.shortlist.findUniqueOrThrow({
      where: { userId_profileId: { userId: viewerId, profileId: target.id } },
      select: { createdAt: true },
    });

    return { shortlisted: true, shortlisted_at: row.createdAt.toISOString() };
  }

  /**
   * The caller's saved profile ids, newest first.
   *
   * Ids and timestamps only. The feed loads this once so each card can draw its
   * bookmark correctly, and it must not turn into a second copy of the Matches
   * list: that one presigns photos and reveals names for open unlocks, neither
   * of which a feed card needs or has any business carrying.
   */
  async index(viewerId: string): Promise<ShortlistIndex> {
    const rows = await this.prisma.shortlist.findMany({
      where: { userId: viewerId },
      orderBy: { createdAt: 'desc' },
      select: { profileId: true, createdAt: true },
    });

    return {
      items: rows.map((row) => ({
        profile_id: row.profileId,
        shortlisted_at: row.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Whether this caller has bookmarked one profile.
   *
   * No visibility guard, deliberately. The answer is `false` both for "you have
   * not saved it" and for "you cannot see it", so a lookup cannot be used to
   * confirm that a profile exists; a `true` can only come back for a profile the
   * caller already saved, which required passing the guard in `add`.
   *
   * One indexed read on the unique pair — the profile page used to call the
   * whole Matches list for this, which signed a photo URL per saved profile on
   * every open.
   */
  async state(viewerId: string, profileId: string): Promise<ShortlistState> {
    const row = await this.prisma.shortlist.findUnique({
      where: { userId_profileId: { userId: viewerId, profileId } },
      select: { createdAt: true },
    });

    return {
      profile_id: profileId,
      shortlisted: row !== null,
      shortlisted_at: row?.createdAt.toISOString() ?? null,
    };
  }

  /**
   * Removes a bookmark.
   *
   * Not scoped by profile existence: a profile that has since been deleted or
   * anonymised still deserves to be removable from the list, and a delete of a
   * row that is not there is the state the caller asked for.
   */
  async remove(viewerId: string, profileId: string): Promise<void> {
    await this.prisma.shortlist.deleteMany({ where: { userId: viewerId, profileId } });
  }

  /**
   * The Matches list: unlocked profiles and bookmarked ones, newest activity
   * first.
   *
   * A profile that is both appears once. Its name is present only while an
   * unlock window is open — `listUnlocks` already suppresses it once the window
   * closes, and a bookmarked profile has never had one — so the list cannot
   * become a slow leak of identities that were paid for yesterday.
   */
  async matches(viewerId: string): Promise<MatchesResponse> {
    const [unlocks, shortlists] = await Promise.all([
      this.unlocks.listUnlocks(viewerId),
      this.prisma.shortlist.findMany({
        where: { userId: viewerId },
        orderBy: { createdAt: 'desc' },
        select: { profileId: true, createdAt: true },
      }),
    ]);

    const shortlistedAt = new Map(shortlists.map((row) => [row.profileId, row.createdAt] as const));
    const ids = [...new Set([...unlocks.items.map((item) => item.profile_id), ...shortlistedAt.keys()])];
    if (ids.length === 0) return { items: [] };

    const profiles = await this.prisma.profile.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        visibility: true,
        deletedAt: true,
        photos: APPROVED_PHOTOS,
      },
    });
    const byId = new Map(profiles.map((profile) => [profile.id, profile] as const));

    const cards = await Promise.all(
      unlocks.items
        .filter((unlock) => isReadable(byId.get(unlock.profile_id)))
        .map(async (unlock) => {
          const shortlisted = shortlistedAt.get(unlock.profile_id) ?? null;
          return this.card({
            profile: byId.get(unlock.profile_id)!,
            displayName: unlock.display_name,
            isUnlocked: unlock.status === 'ACTIVE',
            unlockStatus: unlock.status,
            unlockExpiresAt: unlock.unlock_expires_at,
            remainingMs: unlock.remaining_ms,
            shortlistedAt: shortlisted,
            // Ordering follows the more recent of the two, so unlocking a
            // profile that was bookmarked last week puts it back at the top.
            sortAt: Math.max(
              new Date(unlock.unlocked_at).getTime(),
              shortlisted?.getTime() ?? 0,
            ),
          });
        }),
    );

    const unlockedIds = new Set(unlocks.items.map((item) => item.profile_id));
    const shortlistOnly = await Promise.all(
      shortlists
        .filter((row) => !unlockedIds.has(row.profileId) && isReadable(byId.get(row.profileId)))
        .map(async (row) =>
          this.card({
            profile: byId.get(row.profileId)!,
            // Section 13: a bookmark is not a payment, so no name.
            displayName: null,
            isUnlocked: false,
            unlockStatus: null,
            unlockExpiresAt: null,
            remainingMs: null,
            shortlistedAt: row.createdAt,
            sortAt: row.createdAt.getTime(),
          }),
        ),
    );

    const items = [...cards, ...shortlistOnly]
      .sort((a, b) => b.sortAt - a.sortAt)
      .map(({ sortAt: _sortAt, ...card }) => card);

    return { items };
  }

  /** One row, presigning its photo at the last moment. */
  private async card(input: {
    profile: ProfileRow;
    displayName: string | null;
    isUnlocked: boolean;
    unlockStatus: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | null;
    unlockExpiresAt: string | null;
    remainingMs: number | null;
    shortlistedAt: Date | null;
    sortAt: number;
  }): Promise<MatchCard & { sortAt: number }> {
    return {
      profile_id: input.profile.id,
      display_name: input.displayName,
      photo: await this.photo(input.profile.photos[0]),
      is_shortlisted: input.shortlistedAt !== null,
      is_unlocked: input.isUnlocked,
      unlock_status: input.unlockStatus,
      unlock_expires_at: input.unlockExpiresAt,
      remaining_ms: input.remainingMs,
      shortlisted_at: input.shortlistedAt?.toISOString() ?? null,
      sortAt: input.sortAt,
    };
  }

  /**
   * A signed photo, or nothing.
   *
   * A signing failure collapses the photo rather than sending a null url, which
   * `PreviewPhotoSchema` rejects; the row is still real and still worth showing.
   */
  private async photo(photo: PhotoRow | undefined): Promise<PreviewPhoto | null> {
    if (!photo) return null;
    const url = await this.storage.presignDownload(photo.objectKey).catch(() => null);
    if (!url) return null;
    return {
      photo_id: photo.id,
      url,
      width_px: photo.widthPx,
      height_px: photo.heightPx,
      is_primary: photo.isPrimary,
      photo_type: photo.photoType as PreviewPhoto['photo_type'],
    };
  }
}

/** Whether a profile can still be shown at all. */
function isReadable(profile: ProfileRow | undefined): profile is ProfileRow {
  return Boolean(
    profile &&
      profile.status === 'APPROVED' &&
      profile.visibility === 'ACTIVE' &&
      profile.deletedAt === null,
  );
}
