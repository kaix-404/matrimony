import { Test } from '@nestjs/testing';
import { PrismaClient } from '../prisma/prisma-client';
import { DiscoveryService } from '../discovery/discovery.service';
import { FeatureFlagsService } from '../common/features/feature-flags.service';
import { RecommendationService } from './recommendation.service';
import type { RecommendationsQuery } from '@matrimony/shared';

/**
 * A candidate row and the fields the recommendation query selects.
 *
 * `DiscoveryService` is mocked, so this double only has to model the two queries
 * the service itself issues: the viewer's interest lookup and the candidate
 * pool. The eligibility/visibility predicate is `candidateWhere`'s, asserted
 * separately and covered exhaustively by discovery.service.test.ts.
 */
type Row = {
  id: string;
  createdAt: Date;
  band: string;
  interestKeys: string[];
  photoIds: string[];
};

class FakePrisma {
  /** Null models a user who has not created a profile. */
  viewerProfile: { interests: { interestKey: string }[] } | null = null;
  rows: Row[] = [];

  lastWhere: Record<string, unknown> | null = null;
  lastTake = 0;
  profileFindManyCalls = 0;

  profile = {
    findUnique: async ({ where }: { where: { userId?: string } }) =>
      where.userId === undefined ? null : this.viewerProfile,
    findMany: async (args: { where: Record<string, unknown>; take: number }) => {
      this.lastWhere = args.where;
      this.lastTake = args.take;
      this.profileFindManyCalls += 1;

      const inKeys =
        (args.where['interests'] as { some?: { interestKey?: { in?: string[] } } })?.some
          ?.interestKey?.in ?? null;

      let rows = [...this.rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (inKeys) rows = rows.filter((r) => r.interestKeys.some((k) => inKeys.includes(k)));

      return rows.slice(0, args.take).map((r) => ({
        id: r.id,
        photos: r.photoIds.map((id) => ({
          id,
          objectKey: `k-${id}`,
          widthPx: 1,
          heightPx: 1,
          isPrimary: false,
          photoType: 'SINGLE' as const,
        })),
        user: { networthCategory: r.band },
        interests: r.interestKeys.map((interestKey) => ({ interestKey })),
      }));
    },
  };
}

const PRICE = {
  base_amount: '99.00',
  gst_rate: '0.1800',
  gst_amount: '17.82',
  total_amount: '116.82',
  currency: 'INR' as const,
};

describe('RecommendationService', () => {
  let prisma: FakePrisma;
  let service: RecommendationService;
  let discovery: {
    resolveViewerScope: jest.Mock;
    candidateWhere: jest.Mock;
    previewPhotos: jest.Mock;
  };
  let flags: { isEnabledForUser: jest.Mock };

  const query = (over: Partial<RecommendationsQuery> = {}): RecommendationsQuery => ({
    limit: 20,
    ...over,
  });

  beforeEach(async () => {
    prisma = new FakePrisma();
    discovery = {
      resolveViewerScope: jest.fn(async () => ({
        viewerBand: 'LOW',
        scope: ['LOW'],
        pricing: { LOW: PRICE },
      })),
      candidateWhere: jest.fn(() => ({ __candidate: true })),
      previewPhotos: jest.fn(async (photos: { id: string }[]) =>
        photos.map((p) => ({
          photo_id: p.id,
          url: `https://cdn.test/${p.id}`,
          width_px: 1,
          height_px: 1,
          is_primary: false,
          photo_type: 'SINGLE' as const,
        })),
      ),
    };
    flags = { isEnabledForUser: jest.fn(() => true) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RecommendationService,
        { provide: PrismaClient, useValue: prisma },
        { provide: DiscoveryService, useValue: discovery },
        { provide: FeatureFlagsService, useValue: flags },
      ],
    }).compile();

    service = moduleRef.get(RecommendationService);
  });

  function setViewerInterests(keys: string[]): void {
    prisma.viewerProfile = { interests: keys.map((interestKey) => ({ interestKey })) };
  }

  function seed(
    id: string,
    opts: { band?: string; interestKeys?: string[]; createdAt?: string; photoIds?: string[] } = {},
  ): void {
    prisma.rows.push({
      id,
      band: opts.band ?? 'LOW',
      interestKeys: opts.interestKeys ?? ['MUSIC'],
      createdAt: new Date(opts.createdAt ?? '2026-01-01T00:00:00Z'),
      photoIds: opts.photoIds ?? [],
    });
  }

  describe('the feature flag (answer 7)', () => {
    it('answers disabled and queries nothing when off', async () => {
      flags.isEnabledForUser.mockReturnValue(false);
      setViewerInterests(['MUSIC']);
      seed('a');

      const result = await service.forYou('viewer', query());

      expect(result).toEqual({
        enabled: false,
        items: [],
        applied_categories: [],
        next_cursor: null,
      });
      expect(discovery.resolveViewerScope).not.toHaveBeenCalled();
      expect(prisma.profileFindManyCalls).toBe(0);
    });

    it('checks the aiRecommendations flag for the viewer', async () => {
      await service.forYou('viewer', query());
      expect(flags.isEnabledForUser).toHaveBeenCalledWith('aiRecommendations', 'viewer');
    });
  });

  describe('when there is nothing to recommend', () => {
    it('returns empty when the scope is empty (discovery paused)', async () => {
      discovery.resolveViewerScope.mockResolvedValue({ viewerBand: '', scope: [], pricing: {} });
      setViewerInterests(['MUSIC']);
      seed('a');

      const result = await service.forYou('viewer', query());

      expect(result.enabled).toBe(true);
      expect(result.items).toEqual([]);
      expect(result.applied_categories).toEqual([]);
      expect(prisma.profileFindManyCalls).toBe(0);
    });

    it('returns an empty tab when the viewer has no interests', async () => {
      setViewerInterests([]);
      seed('a');

      const result = await service.forYou('viewer', query());

      expect(result.enabled).toBe(true);
      expect(result.items).toEqual([]);
      // Scope is still reported: the tab is empty because of interests, not reach.
      expect(result.applied_categories).toEqual(['LOW']);
      expect(prisma.profileFindManyCalls).toBe(0);
    });

    it('returns an empty tab when the viewer has no profile', async () => {
      prisma.viewerProfile = null;
      seed('a');

      const result = await service.forYou('viewer', query());
      expect(result.items).toEqual([]);
    });

    it('omits candidates that share no interest', async () => {
      setViewerInterests(['MUSIC']);
      seed('a', { interestKeys: ['COOKING'] });

      const result = await service.forYou('viewer', query());
      expect(result.items).toEqual([]);
    });
  });

  describe('ranking', () => {
    it('ranks a higher overlap first', async () => {
      setViewerInterests(['MUSIC', 'TRAVEL']);
      seed('one', { interestKeys: ['MUSIC'], createdAt: '2026-06-01T00:00:00Z' });
      seed('two', { interestKeys: ['MUSIC', 'TRAVEL'], createdAt: '2026-01-01T00:00:00Z' });

      const result = await service.forYou('viewer', query());
      expect(result.items.map((c) => c.profile_id)).toEqual(['two', 'one']);
    });

    it('keeps newest-first order for equal scores', async () => {
      setViewerInterests(['MUSIC']);
      seed('old', { interestKeys: ['MUSIC'], createdAt: '2026-01-01T00:00:00Z' });
      seed('new', { interestKeys: ['MUSIC'], createdAt: '2026-06-01T00:00:00Z' });

      const result = await service.forYou('viewer', query());
      expect(result.items.map((c) => c.profile_id)).toEqual(['new', 'old']);
    });

    it('honours the requested limit after ranking', async () => {
      setViewerInterests(['MUSIC']);
      seed('a', { interestKeys: ['MUSIC'] });
      seed('b', { interestKeys: ['MUSIC'] });

      const result = await service.forYou('viewer', query({ limit: 1 }));
      expect(result.items).toHaveLength(1);
    });
  });

  describe('the query', () => {
    it('spreads the discovery predicate and adds the interest filter', async () => {
      setViewerInterests(['MUSIC', 'TRAVEL']);
      seed('a', { interestKeys: ['MUSIC'] });

      await service.forYou('viewer', query());

      expect(discovery.candidateWhere).toHaveBeenCalledWith('viewer', 'LOW', ['LOW']);
      expect(prisma.lastWhere!['__candidate']).toBe(true);
      expect(prisma.lastWhere!['interests']).toEqual({
        some: { interestKey: { in: ['MUSIC', 'TRAVEL'] } },
      });
    });

    it('bounds the pool to a multiple of the limit', async () => {
      setViewerInterests(['MUSIC']);
      seed('a');

      await service.forYou('viewer', query({ limit: 3 }));
      // 3 * POOL_MULTIPLIER (5).
      expect(prisma.lastTake).toBe(15);
    });

    it('caps the pool at 200 for a large page', async () => {
      setViewerInterests(['MUSIC']);
      seed('a');

      // Max limit is 50; 50 * 5 = 250, capped to 200.
      await service.forYou('viewer', query({ limit: 50 }));
      expect(prisma.lastTake).toBe(200);
    });
  });

  describe('the card', () => {
    it('carries the locked projection plus sorted shared interests', async () => {
      setViewerInterests(['TRAVEL', 'MUSIC']);
      seed('a', { interestKeys: ['MUSIC', 'TRAVEL'], photoIds: ['p1'] });

      const card = (await service.forYou('viewer', query())).items[0]!;

      expect(Object.keys(card).sort()).toEqual([
        'photos',
        'profile_id',
        'profile_locked',
        'shared_interests',
        'unlock_price',
      ]);
      expect(card.profile_locked).toBe(true);
      expect(card.shared_interests).toEqual(['MUSIC', 'TRAVEL']);
      expect(card.photos).toEqual([
        {
          photo_id: 'p1',
          url: 'https://cdn.test/p1',
          width_px: 1,
          height_px: 1,
          is_primary: false,
          photo_type: 'SINGLE',
        },
      ]);
      expect(card.unlock_price).toEqual(PRICE);
    });

    it('drops a candidate whose band has no active price', async () => {
      // The scope only ever contains priced bands, so this is a guard against a
      // future scope change rather than a reachable path today.
      setViewerInterests(['MUSIC']);
      discovery.resolveViewerScope.mockResolvedValue({
        viewerBand: 'LOW',
        scope: ['LOW'],
        pricing: {},
      });
      seed('a', { interestKeys: ['MUSIC'] });

      const result = await service.forYou('viewer', query());
      expect(result.items).toEqual([]);
    });
  });
});
