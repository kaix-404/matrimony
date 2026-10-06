import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BlockedListResponseSchema, BlockResultSchema } from '@matrimony/shared';
import { BlocksService } from './blocks.service';

/**
 * Blocking tests.
 *
 * The read paths that consume a block are covered elsewhere — discovery proves a
 * blocked pair is excluded from the feed and `UnlockService` proves a block
 * outranks a paid unlock. What is untested until now is the only thing that
 * writes those rows, which is where the actual risk sits: a block that silently
 * fails leaves two people browsing each other after one of them asked not to,
 * and a block that answers with more than it should is a disclosure bug, because
 * the response carries a photo.
 *
 * Responses are validated against the shared schema rather than spot-checked,
 * for the reason `unlock.service.test.ts` gives: an earlier defect returned
 * `first_name: ''` on an idempotent replay, satisfied every hand-written
 * expectation, and would have been rejected by the real client.
 */

const VIEWER = 'user_viewer';
const TARGET = 'user_target';
const PROFILE = 'profile_target';
const BAND = 'LOW';
const OTHER_BAND = 'HIGH';

interface UserRow {
  id: string;
  networthCategory: string;
  deletedAt: Date | null;
  isAnonymised: boolean;
  status: string;
}

interface PhotoRow {
  id: string;
  objectKey: string;
  widthPx: number;
  heightPx: number;
  isPrimary: boolean;
  sortOrder: number;
  photoType: string;
  status: string;
}

interface ProfileRow {
  id: string;
  userId: string;
  deletedAt: Date | null;
  photos: PhotoRow[];
}

interface BlockRow {
  blockerId: string;
  blockedId: string;
  isMutual: boolean;
  createdAt: Date;
}

function viewer(): UserRow {
  return { id: VIEWER, networthCategory: BAND, deletedAt: null, isAnonymised: false, status: 'ACTIVE' };
}

function target(): UserRow {
  return { id: TARGET, networthCategory: BAND, deletedAt: null, isAnonymised: false, status: 'ACTIVE' };
}

function photo(overrides: Partial<PhotoRow> = {}): PhotoRow {
  return {
    id: 'photo_1',
    objectKey: 'photos/1.jpg',
    widthPx: 800,
    heightPx: 1000,
    isPrimary: true,
    sortOrder: 0,
    photoType: 'SINGLE',
    status: 'APPROVED',
    ...overrides,
  };
}

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return { id: PROFILE, userId: TARGET, deletedAt: null, photos: [photo()], ...overrides };
}

/** The `select.photos` clause the service sends, read structurally. */
interface PhotoClause {
  where?: { status?: string };
  orderBy?: { isPrimary?: string; sortOrder?: string }[];
  take?: number;
}

/** The `where` clause `blockedUser.findMany` receives. */
interface BlockWhere {
  blockerId?: string;
  blocked?: {
    deletedAt?: Date | null;
    isAnonymised?: boolean;
    status?: { not?: string };
    profile?: { deletedAt?: Date | null };
  };
}

/** The `select` clause `blockedUser.findMany` receives. */
interface BlockSelect {
  blocked?: {
    select: {
      profile: { select: { id?: boolean; photos?: PhotoClause } };
    };
  };
}

/**
 * Applies the `select.photos` clause the service actually sends.
 *
 * Reading the clause rather than returning a fixed shape is the point: if the
 * service stopped filtering on `APPROVED`, or stopped ordering primary-first,
 * this would follow it and the assertions on the returned photo would move
 * rather than fail — so the tests below pin the outcome, not just the call.
 */
function pickPhotos(p: ProfileRow, clause: PhotoClause | undefined): PhotoRow[] {
  if (!clause) return [];

  let rows = p.photos;
  const status = clause.where?.status;
  if (status) rows = rows.filter((r) => r.status === status);

  for (const order of clause.orderBy ?? []) {
    if ('isPrimary' in order) {
      rows = [...rows].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    } else if ('sortOrder' in order) {
      rows = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
    }
  }

  if (clause.take) rows = rows.slice(0, clause.take);
  return rows;
}

function makeService(
  opts: {
    users?: UserRow[];
    profiles?: ProfileRow[];
    blocks?: BlockRow[];
    signable?: boolean;
  } = {},
) {
  const users = opts.users ?? [viewer(), target()];
  const profiles = opts.profiles ?? [profile()];
  const blocks: BlockRow[] = opts.blocks ?? [];

  const prisma = {
    profile: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: { photos?: PhotoClause };
      }) => {
        const p = profiles.find((row) => row.id === where.id);
        if (!p) return null;

        const owner = users.find((u) => u.id === p.userId);
        if (!owner) return null;

        return {
          id: p.id,
          userId: p.userId,
          deletedAt: p.deletedAt,
          user: {
            networthCategory: owner.networthCategory,
            deletedAt: owner.deletedAt,
            isAnonymised: owner.isAnonymised,
            status: owner.status,
          },
          photos: pickPhotos(p, select?.photos),
        };
      },
    },
    user: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const u = users.find((row) => row.id === where.id);
        if (!u) throw new Error('record not found');
        return { networthCategory: u.networthCategory };
      },
    },
    blockedUser: {
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: { blockerId: string; blockedId: string; isMutual: boolean }[];
        skipDuplicates?: boolean;
      }) => {
        let count = 0;
        for (const row of data) {
          const exists = blocks.some(
            (b) => b.blockerId === row.blockerId && b.blockedId === row.blockedId,
          );
          if (exists && skipDuplicates) continue;
          blocks.push({ ...row, createdAt: new Date('2026-10-06T12:00:00.000Z') });
          count++;
        }
        return { count };
      },
      findUniqueOrThrow: async ({ where }: { where: { blockerId_blockedId: { blockerId: string; blockedId: string } } }) => {
        const key = where.blockerId_blockedId;
        const row = blocks.find((b) => b.blockerId === key.blockerId && b.blockedId === key.blockedId);
        if (!row) throw new Error('record not found');
        return { createdAt: row.createdAt };
      },
      findMany: async ({
        where,
        orderBy,
        select,
      }: {
        where: BlockWhere;
        orderBy?: { createdAt?: string };
        select?: BlockSelect;
      }) => {
        // Evaluates the clause the service sends rather than a fixed policy, so
        // a dropped condition in `where` shows up as a row that should have been
        // filtered out.
        const rows = blocks.filter((b) => (where.blockerId ? b.blockerId === where.blockerId : true));

        const visible = rows.filter((b) => {
          const cond = where.blocked;
          if (!cond) return true;

          const u = users.find((row) => row.id === b.blockedId);
          if (!u) return false;

          if ('deletedAt' in cond && u.deletedAt !== cond.deletedAt) return false;
          if ('isAnonymised' in cond && u.isAnonymised !== cond.isAnonymised) return false;
          if (cond.status?.not !== undefined && u.status === cond.status.not) return false;

          if (cond.profile) {
            const p = profiles.find((row) => row.userId === u.id);
            if (!p) return false;
            if ('deletedAt' in cond.profile && p.deletedAt !== cond.profile.deletedAt) return false;
          }

          return true;
        });

        const sorted = [...visible];
        if (orderBy?.createdAt === 'desc') sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (orderBy?.createdAt === 'asc') sorted.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        // The photo clause lives under `select`, not `where`. Reading it from the
        // wrong place silently returns an empty photo list, which makes every
        // list entry degrade to a null photo and the coverage look complete.
        const photoClause = select?.blocked?.select?.profile?.select?.photos;

        return sorted.map((b) => {
          const p = profiles.find((row) => row.userId === b.blockedId) ?? null;
          return {
            createdAt: b.createdAt,
            blocked: {
              profile: p ? { id: p.id, photos: pickPhotos(p, photoClause) } : null,
            },
          };
        });
      },
      deleteMany: async ({ where }: { where: { blockerId: string; blockedId: string } }) => {
        const before = blocks.length;
        for (let i = blocks.length - 1; i >= 0; i--) {
          const b = blocks[i];
          if (b.blockerId === where.blockerId && b.blockedId === where.blockedId) blocks.splice(i, 1);
        }
        return { count: before - blocks.length };
      },
    },
  };

  const storage = {
    presignDownload: async (key: string) => (opts.signable === false ? null : `https://s3.test/${key}`),
  };

  return {
    blocks,
    profiles,
    users,
    service: new BlocksService(prisma as never, storage as never),
  };
}

/** Every key name anywhere in a payload, so a nested leak cannot hide. */
function allKeys(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, found));
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      found.add(k);
      allKeys(v, found);
    }
  }
  return found;
}

describe('BlocksService', () => {
  describe('blocking', () => {
    it('records a block and returns a schema-valid entry', async () => {
      const { service, blocks } = makeService();

      const result = await service.block(VIEWER, PROFILE);

      expect(BlockResultSchema.parse(result)).toEqual(result);
      expect(result.blocked).toBe(true);
      expect(result.profile.profile_id).toBe(PROFILE);
      expect(result.profile.photo?.url).toBe('https://s3.test/photos/1.jpg');
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({ blockerId: VIEWER, blockedId: TARGET });
    });

    it('hides the pair in both directions', async () => {
      const { service, blocks } = makeService();

      await service.block(VIEWER, PROFILE);

      // Section 19 and client question F5: a block is one user's decision but
      // applies symmetrically, so neither side keeps seeing the other in the
      // feed. Discovery reads exactly these two columns.
      expect(blocks[0].isMutual).toBe(true);
    });

    it('exposes no name and none of the fields section 13 withholds', async () => {
      const { service } = makeService();

      const keys = allKeys(await service.block(VIEWER, PROFILE));

      // Discovery cards carry no name either, so a blocked entry that had one
      // would hand the caller a field they have never been entitled to — blocked
      // is not unlocked. The list exists so the offending key is surfaced by
      // the assertion instead of by jest's message-less `expect`.
      const forbidden = ['first_name', 'lastName', 'last_name', 'display_name', 'name', 'contact', 'mobile'];
      expect([...keys].filter((k) => forbidden.includes(k))).toEqual([]);
    });

    it('is idempotent rather than an error on a retry', async () => {
      const { service, blocks } = makeService();

      const first = await service.block(VIEWER, PROFILE);
      const second = await service.block(VIEWER, PROFILE);

      expect(BlockResultSchema.parse(second)).toEqual(second);
      expect(second).toEqual(first);
      // A recovered connection re-sends the request; it must not duplicate the
      // row, and it must not surface as a 409 to someone who blocked successfully.
      expect(blocks).toHaveLength(1);
    });

    it('refuses to block your own profile', async () => {
      const { service } = makeService({
        users: [viewer()],
        profiles: [profile({ userId: VIEWER })],
      });

      await expect(service.block(VIEWER, PROFILE)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('answers 404 for a profile that does not exist', async () => {
      const { service } = makeService({ profiles: [] });

      await expect(service.block(VIEWER, 'profile_nope')).rejects.toThrow('Profile not found');
    });

    it('answers 404 for a soft-deleted profile', async () => {
      const { service, blocks } = makeService({
        profiles: [profile({ deletedAt: new Date('2026-10-01T00:00:00.000Z') })],
      });

      await expect(service.block(VIEWER, PROFILE)).rejects.toBeInstanceOf(NotFoundException);
      expect(blocks).toHaveLength(0);
    });

    it('answers 404 once the owner has been anonymised', async () => {
      const { service, blocks } = makeService({
        users: [viewer(), { ...target(), isAnonymised: true }],
      });

      await expect(service.block(VIEWER, PROFILE)).rejects.toBeInstanceOf(NotFoundException);
      expect(blocks).toHaveLength(0);
    });

    it('answers 404 when the owner is marked DELETED', async () => {
      const { service } = makeService({
        users: [viewer(), { ...target(), status: 'DELETED' }],
      });

      await expect(service.block(VIEWER, PROFILE)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('will not redeem a cross-band profile id for a photo', async () => {
      // Section 12: "Profile IDs must not allow unauthorized cross-category
      // access." The block response is the one write here that answers with an
      // image, so an id harvested from the other band would otherwise be
      // exchangeable for something the caller's feed never showed them.
      const { service, blocks } = makeService({
        users: [viewer(), { ...target(), networthCategory: OTHER_BAND }],
      });

      await expect(service.block(VIEWER, PROFILE)).rejects.toBeInstanceOf(NotFoundException);
      expect(blocks).toHaveLength(0);
    });

    it('returns a null photo when the object cannot be signed', async () => {
      const { service } = makeService({ signable: false });

      const result = await service.block(VIEWER, PROFILE);

      // Section 38 forbids a null `url` reaching the app, so the photo collapses
      // entirely rather than being sent half-formed. The block still succeeds:
      // one unreadable object must not stop someone being blocked.
      expect(result.profile.photo).toBeNull();
      expect(BlockResultSchema.parse(result)).toEqual(result);
    });

    it('returns a null photo when no photo is approved', async () => {
      const { service } = makeService({
        profiles: [profile({ photos: [photo({ status: 'PENDING_REVIEW' })] })],
      });

      const result = await service.block(VIEWER, PROFILE);

      expect(result.profile.photo).toBeNull();
    });
  });

  describe('unblocking', () => {
    it('removes the block', async () => {
      const { service, blocks } = makeService({
        blocks: [{ blockerId: VIEWER, blockedId: TARGET, isMutual: true, createdAt: new Date('2026-10-06T10:00:00.000Z') }],
      });

      await service.unblock(VIEWER, PROFILE);

      expect(blocks).toHaveLength(0);
    });

    it('is idempotent when nothing was blocked', async () => {
      const { service } = makeService();

      await expect(service.unblock(VIEWER, PROFILE)).resolves.toBeUndefined();
    });

    it('is idempotent when the profile row is gone', async () => {
      const { service, blocks } = makeService({ profiles: [] });

      await expect(service.unblock(VIEWER, PROFILE)).resolves.toBeUndefined();
      // Cannot map profile -> owner without a profile, so the row is left alone
      // rather than guessing; `list` hides it either way.
      expect(blocks).toHaveLength(0);
    });

    it('removes only the caller\'s own block', async () => {
      const other = { blockerId: 'user_other', blockedId: TARGET, isMutual: true, createdAt: new Date('2026-10-06T10:00:00.000Z') };
      const { service, blocks } = makeService({
        blocks: [{ blockerId: VIEWER, blockedId: TARGET, isMutual: true, createdAt: new Date('2026-10-06T10:00:00.000Z') }, other],
      });

      await service.unblock(VIEWER, PROFILE);

      expect(blocks).toEqual([other]);
    });
  });

  describe('the blocked list', () => {
    const at = (iso: string) => new Date(iso);

    it('returns blocked profiles, newest first, schema-valid', async () => {
      const other = profile({ id: 'profile_two', userId: 'user_two' });
      const { service } = makeService({
        users: [
          viewer(),
          target(),
          { id: 'user_two', networthCategory: BAND, deletedAt: null, isAnonymised: false, status: 'ACTIVE' },
        ],
        profiles: [profile(), other],
        blocks: [
          { blockerId: VIEWER, blockedId: TARGET, isMutual: true, createdAt: at('2026-10-06T10:00:00.000Z') },
          { blockerId: VIEWER, blockedId: 'user_two', isMutual: true, createdAt: at('2026-10-06T11:00:00.000Z') },
        ],
      });

      const result = await service.list(VIEWER);

      expect(BlockedListResponseSchema.parse(result)).toEqual(result);
      expect(result.items.map((i) => i.profile_id)).toEqual(['profile_two', PROFILE]);
    });

    it('exposes no name on any entry', async () => {
      const { service } = makeService({
        blocks: [{ blockerId: VIEWER, blockedId: TARGET, isMutual: true, createdAt: new Date('2026-10-06T10:00:00.000Z') }],
      });

      const keys = allKeys(await service.list(VIEWER));

      const forbidden = ['first_name', 'lastName', 'last_name', 'display_name', 'name', 'contact', 'mobile'];
      expect([...keys].filter((k) => forbidden.includes(k))).toEqual([]);
    });

    it('serves the photo the caller used to pick the profile out of the feed', async () => {
      const { service } = makeService({
        blocks: [
          { blockerId: VIEWER, blockedId: TARGET, isMutual: true, createdAt: new Date('2026-10-06T10:00:00.000Z') },
        ],
      });

      const result = await service.list(VIEWER);

      expect(result.items[0].photo).toEqual({
        photo_id: 'photo_1',
        url: 'https://s3.test/photos/1.jpg',
        width_px: 800,
        height_px: 1000,
        is_primary: true,
        photo_type: 'SINGLE',
      });
    });

    it('serves only approved photos from the list', async () => {
      const { service } = makeService({
        profiles: [
          profile({
            photos: [
              photo({ id: 'photo_pending', isPrimary: true, status: 'PENDING_REVIEW' }),
              photo({ id: 'photo_ok', isPrimary: false, status: 'APPROVED' }),
            ],
          }),
        ],
        blocks: [
          { blockerId: VIEWER, blockedId: TARGET, isMutual: true, createdAt: new Date('2026-10-06T10:00:00.000Z') },
        ],
      });

      const result = await service.list(VIEWER);

      // Section 9: only approved photos are shown to other users, and the block
      // list is another user looking. Without the filter the rejected or pending
      // photo would be signed and served here even though discovery omits it.
      expect(result.items[0].photo?.photo_id).toBe('photo_ok');
    });

    it('only lists the caller\'s own blocks', async () => {
      const { service } = makeService({
        blocks: [
          { blockerId: 'user_other', blockedId: TARGET, isMutual: true, createdAt: new Date('2026-10-06T10:00:00.000Z') },
        ],
      });

      const result = await service.list(VIEWER);

      expect(result.items).toEqual([]);
    });

    it('hides an owner who has been anonymised', async () => {
      const { service } = makeService({
        users: [viewer(), { ...target(), isAnonymised: true }],
        blocks: [{ blockerId: VIEWER, blockedId: TARGET, isMutual: true, createdAt: new Date('2026-10-06T10:00:00.000Z') }],
      });

      const result = await service.list(VIEWER);

      // Section 21: PII is overwritten at deletion. Presigning a URL for a
      // purged account's photo would undo the erasure on every page load.
      expect(result.items).toEqual([]);
    });

    it('hides an owner whose account was deleted', async () => {
      const { service } = makeService({
        users: [viewer(), { ...target(), deletedAt: new Date('2026-10-02T00:00:00.000Z') }],
        blocks: [{ blockerId: VIEWER, blockedId: TARGET, isMutual: true, createdAt: new Date('2026-10-06T10:00:00.000Z') }],
      });

      expect((await service.list(VIEWER)).items).toEqual([]);
    });

    it('hides an owner marked DELETED', async () => {
      const { service } = makeService({
        users: [viewer(), { ...target(), status: 'DELETED' }],
        blocks: [{ blockerId: VIEWER, blockedId: TARGET, isMutual: true, createdAt: new Date('2026-10-06T10:00:00.000Z') }],
      });

      expect((await service.list(VIEWER)).items).toEqual([]);
    });

    it('hides a soft-deleted profile', async () => {
      const { service } = makeService({
        profiles: [profile({ deletedAt: new Date('2026-10-02T00:00:00.000Z') })],
        blocks: [{ blockerId: VIEWER, blockedId: TARGET, isMutual: true, createdAt: new Date('2026-10-06T10:00:00.000Z') }],
      });

      expect((await service.list(VIEWER)).items).toEqual([]);
    });

    it('omits a block whose profile row was hard-deleted underneath it', async () => {
      const { service } = makeService({ profiles: [] });

      // The account still exists, but the profile it was filed against does not,
      // so there is nothing to render and nothing to presign.
      expect((await service.list(VIEWER)).items).toEqual([]);
    });

    it('still returns the row when the photo cannot be signed', async () => {
      const { service } = makeService({
        signable: false,
        blocks: [{ blockerId: VIEWER, blockedId: TARGET, isMutual: true, createdAt: new Date('2026-10-06T10:00:00.000Z') }],
      });

      const result = await service.list(VIEWER);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].photo).toBeNull();
      expect(BlockedListResponseSchema.parse(result)).toEqual(result);
    });
  });
});
