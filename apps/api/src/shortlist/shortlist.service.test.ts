import {
  MatchesResponseSchema,
  ShortlistIndexSchema,
  ShortlistResultSchema,
  ShortlistStateSchema,
} from '@matrimony/shared';
import { ShortlistService } from './shortlist.service';

/**
 * Shortlisting and the Matches list.
 *
 * Two properties carry the feature and both are asserted through the public
 * shape rather than by inspecting calls. First: a bookmark goes through the same
 * guard a profile view uses, so it cannot become a way to confirm that a hidden
 * profile exists. Second: the Matches list is a merge of two different things —
 * a purchase with a window and a free bookmark — and it must not let the free
 * one inherit the paid one's disclosure. A bookmarked profile therefore carries
 * no name, ever, and an expired unlock stops carrying one even though the row
 * stays in the list.
 */

const VIEWER = 'user_viewer';

interface ShortlistRow {
  profileId: string;
  createdAt: Date;
}

interface ProfileRow {
  id: string;
  firstName: string;
  lastName: string | null;
  status: string;
  visibility: string;
  deletedAt: Date | null;
  photos: Array<{
    id: string;
    objectKey: string;
    widthPx: number;
    heightPx: number;
    isPrimary: boolean;
    photoType: string;
  }>;
}

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'profile_a',
    firstName: 'Asha',
    lastName: 'Rao',
    status: 'APPROVED',
    visibility: 'ACTIVE',
    deletedAt: null,
    photos: [
      {
        id: 'photo_1',
        objectKey: 'photos/a.jpg',
        widthPx: 800,
        heightPx: 1000,
        isPrimary: true,
        photoType: 'SINGLE',
      },
    ],
    ...overrides,
  };
}

/** An unlock summary, shaped as `UnlockService.listUnlocks` returns it. */
function unlock(overrides: Record<string, unknown> = {}) {
  return {
    profile_id: 'profile_a',
    display_name: 'Asha Rao',
    status: 'ACTIVE' as const,
    unlocked_at: '2026-11-14T09:00:00.000Z',
    unlock_expires_at: '2026-11-15T09:00:00.000Z',
    remaining_ms: 3_600_000,
    ...overrides,
  };
}

function harness(
  options: {
    shortlists?: ShortlistRow[];
    profiles?: ProfileRow[];
    unlocks?: ReturnType<typeof unlock>[];
  } = {},
) {
  const prisma = {
    shortlist: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ createdAt: new Date('2026-11-14T10:00:00.000Z') }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue(options.shortlists ?? []),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    profile: {
      findMany: jest.fn().mockResolvedValue(options.profiles ?? []),
    },
  };
  const unlocks = {
    assertViewable: jest.fn().mockResolvedValue({ id: 'profile_a' }),
    listUnlocks: jest.fn().mockResolvedValue({ items: options.unlocks ?? [] }),
  };
  const storage = {
    presignDownload: jest.fn(async (key: string) => `https://storage.test/${key}`),
  };

  const service = new ShortlistService(
    prisma as unknown as ConstructorParameters<typeof ShortlistService>[0],
    unlocks as unknown as ConstructorParameters<typeof ShortlistService>[1],
    storage as unknown as ConstructorParameters<typeof ShortlistService>[2],
  );

  return { service, prisma, unlocks, storage };
}

describe('ShortlistService', () => {
  describe('add', () => {
    it('checks the caller may see the profile before bookmarking it', async () => {
      const { service, unlocks, prisma } = harness();

      const result = ShortlistResultSchema.parse(await service.add(VIEWER, 'profile_a'));

      expect(unlocks.assertViewable).toHaveBeenCalledWith(VIEWER, 'profile_a');
      expect(prisma.shortlist.createMany).toHaveBeenCalledWith({
        data: [{ userId: VIEWER, profileId: 'profile_a' }],
        skipDuplicates: true,
      });
      expect(result).toEqual({
        shortlisted: true,
        shortlisted_at: '2026-11-14T10:00:00.000Z',
      });
    });

    it('propagates the guard refusal rather than writing a row', async () => {
      const { service, unlocks, prisma } = harness();
      unlocks.assertViewable.mockRejectedValue(new Error('Profile not found'));

      await expect(service.add(VIEWER, 'profile_hidden')).rejects.toThrow('Profile not found');
      expect(prisma.shortlist.createMany).not.toHaveBeenCalled();
    });

    it('answers with the original timestamp on a repeat', async () => {
      // `skipDuplicates` leaves the existing row alone, and the read afterwards
      // is what keeps the list order stable across a double tap.
      const { service, prisma } = harness();

      await service.add(VIEWER, 'profile_a');

      expect(prisma.shortlist.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { userId_profileId: { userId: VIEWER, profileId: 'profile_a' } },
        select: { createdAt: true },
      });
    });
  });

  describe('index', () => {
    it('answers ids and timestamps, and nothing about the profiles', async () => {
      // The feed reads this once per load to fill its bookmark icons. Anything
      // more — photos, names — would make it a second Matches list.
      const { service, prisma } = harness();
      prisma.shortlist.findMany.mockResolvedValue([
        { profileId: 'profile_b', createdAt: new Date('2026-11-14T11:00:00.000Z') },
        { profileId: 'profile_a', createdAt: new Date('2026-11-14T09:00:00.000Z') },
      ]);

      const index = ShortlistIndexSchema.parse(await service.index(VIEWER));

      expect(index.items).toEqual([
        { profile_id: 'profile_b', shortlisted_at: '2026-11-14T11:00:00.000Z' },
        { profile_id: 'profile_a', shortlisted_at: '2026-11-14T09:00:00.000Z' },
      ]);
      expect(prisma.profile.findMany).not.toHaveBeenCalled();
    });
  });

  describe('state', () => {
    it('answers false for a profile nobody saved, without consulting the view guard', async () => {
      // No `assertViewable` call on purpose: `false` is the answer for "not
      // saved" and for "cannot see it" alike, so the route cannot be used to
      // confirm that a hidden profile exists.
      const { service, unlocks, prisma } = harness();

      const state = ShortlistStateSchema.parse(await service.state(VIEWER, 'profile_a'));

      expect(state).toEqual({ profile_id: 'profile_a', shortlisted: false, shortlisted_at: null });
      expect(prisma.shortlist.findUnique).toHaveBeenCalledWith({
        where: { userId_profileId: { userId: VIEWER, profileId: 'profile_a' } },
        select: { createdAt: true },
      });
      expect(unlocks.assertViewable).not.toHaveBeenCalled();
    });

    it('answers true with the original time for a saved profile', async () => {
      const { service, prisma } = harness();
      prisma.shortlist.findUnique.mockResolvedValue({
        createdAt: new Date('2026-11-14T08:00:00.000Z'),
      });

      const state = ShortlistStateSchema.parse(await service.state(VIEWER, 'profile_a'));

      expect(state).toEqual({
        profile_id: 'profile_a',
        shortlisted: true,
        shortlisted_at: '2026-11-14T08:00:00.000Z',
      });
    });
  });

  describe('remove', () => {
    it('deletes by owner and profile, and says nothing when nothing matches', async () => {
      const { service, prisma } = harness();
      prisma.shortlist.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(VIEWER, 'profile_a')).resolves.toBeUndefined();
      expect(prisma.shortlist.deleteMany).toHaveBeenCalledWith({
        where: { userId: VIEWER, profileId: 'profile_a' },
      });
    });
  });

  describe('matches', () => {
    it('returns nothing without querying profiles when the list is empty', async () => {
      const { service, prisma } = harness();

      const result = MatchesResponseSchema.parse(await service.matches(VIEWER));

      expect(result.items).toEqual([]);
      expect(prisma.profile.findMany).not.toHaveBeenCalled();
    });

    it('lists a shortlisted profile without a name or contact access', async () => {
      const { service } = harness({
        shortlists: [{ profileId: 'profile_a', createdAt: new Date('2026-11-14T08:00:00.000Z') }],
        profiles: [profile()],
      });

      const result = MatchesResponseSchema.parse(await service.matches(VIEWER));

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        profile_id: 'profile_a',
        display_name: null,
        is_shortlisted: true,
        is_unlocked: false,
        unlock_status: null,
        unlock_expires_at: null,
        shortlisted_at: '2026-11-14T08:00:00.000Z',
      });
      expect(result.items[0].photo?.url).toBe('https://storage.test/photos/a.jpg');
    });

    it('merges a profile that is both booked and unlocked into one card', async () => {
      const { service } = harness({
        shortlists: [{ profileId: 'profile_a', createdAt: new Date('2026-11-14T08:00:00.000Z') }],
        profiles: [profile()],
        unlocks: [unlock()],
      });

      const result = MatchesResponseSchema.parse(await service.matches(VIEWER));

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        profile_id: 'profile_a',
        display_name: 'Asha Rao',
        is_unlocked: true,
        unlock_status: 'ACTIVE',
        is_shortlisted: true,
        remaining_ms: 3_600_000,
      });
    });

    it('stops disclosing the name once the unlock window has closed', async () => {
      const { service } = harness({
        profiles: [profile()],
        unlocks: [
          unlock({
            display_name: null,
            status: 'EXPIRED',
            remaining_ms: 0,
            unlock_expires_at: '2026-11-13T09:00:00.000Z',
          }),
        ],
      });

      const result = MatchesResponseSchema.parse(await service.matches(VIEWER));

      expect(result.items[0]).toMatchObject({
        display_name: null,
        is_unlocked: false,
        unlock_status: 'EXPIRED',
        is_shortlisted: false,
      });
    });

    it('drops rows whose profile can no longer be shown', async () => {
      const { service } = harness({
        shortlists: [
          { profileId: 'profile_a', createdAt: new Date('2026-11-14T08:00:00.000Z') },
          { profileId: 'profile_b', createdAt: new Date('2026-11-14T09:00:00.000Z') },
        ],
        profiles: [profile(), profile({ id: 'profile_b', status: 'SUSPENDED' })],
      });

      const result = MatchesResponseSchema.parse(await service.matches(VIEWER));

      expect(result.items.map((item) => item.profile_id)).toEqual(['profile_a']);
    });

    it('orders by the later of unlocking and shortlisting', async () => {
      const { service } = harness({
        shortlists: [
          // Bookmarked after the unlock, so this one leads.
          { profileId: 'profile_a', createdAt: new Date('2026-11-14T12:00:00.000Z') },
        ],
        profiles: [profile(), profile({ id: 'profile_b', firstName: 'Bina' })],
        unlocks: [
          unlock(),
          unlock({
            profile_id: 'profile_b',
            display_name: 'Bina',
            unlocked_at: '2026-11-14T11:00:00.000Z',
          }),
        ],
      });

      const result = MatchesResponseSchema.parse(await service.matches(VIEWER));

      expect(result.items.map((item) => item.profile_id)).toEqual(['profile_a', 'profile_b']);
    });

    it('keeps a card when its photo cannot be signed', async () => {
      const { service, storage } = harness({
        profiles: [profile({ photos: [profile().photos[0]] })],
        unlocks: [unlock()],
      });
      storage.presignDownload.mockResolvedValue(null as never);

      const result = MatchesResponseSchema.parse(await service.matches(VIEWER));

      expect(result.items[0].photo).toBeNull();
      expect(result.items[0].display_name).toBe('Asha Rao');
    });
  });
});
