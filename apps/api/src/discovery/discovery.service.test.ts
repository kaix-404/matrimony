import { Test } from '@nestjs/testing';
import { PrismaClient } from '../prisma/prisma-client';
import { StorageService } from '../storage/s3.service';
import { DiscoveryService } from './discovery.service';
import { VisibilityPreferenceService } from './visibility-preference.service';
import type { DiscoveryQuery } from '@matrimony/shared';
import Decimal from 'decimal.js';

/**
 * A seeded user. `visibilityConfigured` is what the DB stores on the flag row;
 * `null` means there is no PartnerPreference row at all, which is the state the
 * own-band default is defined against.
 */
type SeedUser = {
  id: string;
  band: string;
  status: 'ACTIVE' | 'SUSPENDED';
  identityVerified: boolean;
  setupFeePaid: boolean;
  anonymised: boolean;
  deleted: boolean;
  visibilityConfigured: boolean | null;
  visibleTo: string[];
};

type SeedProfile = {
  id: string;
  userId: string;
  status: 'APPROVED' | 'DRAFT' | 'SUSPENDED';
  visibility: 'ACTIVE' | 'PAUSED';
  deleted: boolean;
  createdAt: Date;
  photos: {
    id: string;
    objectKey: string;
    widthPx: number;
    heightPx: number;
    isPrimary: boolean;
    photoType: 'SINGLE' | 'FAMILY';
    status: 'APPROVED' | 'PENDING_REVIEW';
    sortOrder: number;
  }[];
};

/**
 * Deliberately throws on a predicate shape it does not recognise.
 *
 * A double that quietly ignored an unmodelled `where` would let a security gate
 * be deleted from the query and the tests would still pass — which is the exact
 * failure this suite is meant to catch.
 */
class FakePrisma {
  users: SeedUser[] = [];
  profiles: SeedProfile[] = [];
  blockedPairs = new Set<string>();
  pricing: { category: string; baseAmount: unknown; gstRate: unknown }[] = [];
  /** The last `where` handed to the candidate query, for structural assertions. */
  lastProfileWhere: unknown = null;
  profileFindManyCalls = 0;

  user = {
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const row = this.users.find((u) => u.id === where.id);
      if (!row) throw new Error(`no user ${where.id}`);
      return { networthCategory: row.band };
    },
    findMany: async ({ where, distinct }: { where: Record<string, unknown>; distinct?: string[] }) => {
      const matched = this.users.filter((u) => matchesUser(u, where, this));
      if (!distinct?.includes('networthCategory')) return matched.map(toUserSelect);

      const seen = new Set<string>();
      return matched
        .filter((u) => (seen.has(u.band) ? false : (seen.add(u.band), true)))
        .map((u) => ({ networthCategory: u.band }));
    },
  };

  profile = {
    findMany: async (args: {
      where: Record<string, unknown>;
      orderBy: { createdAt: string }[];
      take: number;
      cursor?: { id: string };
      skip?: number;
    }) => {
      this.lastProfileWhere = args.where;
      this.profileFindManyCalls += 1;

      let rows = this.profiles.filter((p) => matchesProfile(p, args.where, this));

      // createdAt desc, then id desc — the same order the service requests.
      rows = [...rows].sort((a, b) => {
        const byDate = b.createdAt.getTime() - a.createdAt.getTime();
        return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
      });

      if (args.cursor) {
        const at = rows.findIndex((p) => p.id === args.cursor!.id);
        rows = at >= 0 ? rows.slice(at + (args.skip ?? 0)) : [];
      }

      return rows.slice(0, args.take).map((p) => ({
        id: p.id,
        photos: p.photos
          .filter((photo) => photo.status === 'APPROVED')
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .slice(0, 6)
          .map((photo) => ({
            id: photo.id,
            objectKey: photo.objectKey,
            widthPx: photo.widthPx,
            heightPx: photo.heightPx,
            isPrimary: photo.isPrimary,
            photoType: photo.photoType,
          })),
        user: {
          networthCategory:
            this.users.find((u) => u.id === p.userId)!.band satisfies string,
        },
      }));
    },
  };

  pricingConfig = {
    findMany: async ({ where }: { where: { category: { in: string[] }; effectiveTo: null } }) => {
      if (where.effectiveTo !== null) {
        throw new Error('double only models current pricing; unexpected effectiveTo filter');
      }
      return this.pricing
        .filter((row) => where.category.in.includes(row.category))
        .map((row) => ({
          category: row.category,
          baseAmount: row.baseAmount,
          gstRate: row.gstRate,
        }));
    },
  };
}

/**
 * A cuid-shaped profile id.
 *
 * The service validates the cursor's decoded id against the cuid shape, so the
 * fixtures have to be realistic — an id like `p-a` would be rejected as garbage
 * and the paging tests would pass without ever exercising a real cursor.
 */
const pid = (key: string): string => `ck${key.padEnd(22, '0')}`;

/**
 * Real Decimal values, not a stand-in.
 *
 * `quotePayment` does half-up rounding at a fixed scale, and a hand-rolled
 * double would be the obvious place for that rounding to be faked into passing.
 * The test asserts ₹99 → ₹116.82, so the arithmetic has to be the real one.
 */
const dec = (value: number) => new Decimal(value);

function toUserSelect(u: SeedUser) {
  return { networthCategory: u.band };
}

/** Predicate evaluator for the shapes the service actually issues. */
function matchesUser(u: SeedUser, where: Record<string, unknown>, storeRef: FakePrisma): boolean {
  if (where['networthCategory']) {
    const band = where['networthCategory'];
    // Scalar form (`networthCategory: viewerBand`) and set form (`{ in }`) are
    // both issued: the scope uses `in`, the never-configured branch uses a
    // scalar. Handling only the set form would make that branch match every
    // band and silently invert the two-way rule.
    if (typeof band === 'string') {
      if (band !== u.band) return false;
    } else if ((band as { in?: string[] }).in) {
      if (!(band as { in: string[] }).in.includes(u.band)) return false;
    }
  }

  const or = where['OR'] as Record<string, unknown>[] | undefined;
  if (or && !or.some((branch) => matchesUser(u, branch, storeRef))) return false;

const vis = where['visibilityCategories'] as { some: { category: string } } | undefined;
  if (vis && !u.visibleTo.includes(vis.some.category)) return false;

  const pref = where['partnerPreference'] as
    | { is: { visibilityConfigured?: boolean } | null }
    | undefined;
  if (pref) {
    // `is: null` asserts the row is ABSENT, which is the state the own-band
    // default is defined against. Reading it as "no filter" would match every
    // user and quietly defeat the two-way rule.
    if (pref.is === null) {
      if (u.visibilityConfigured !== null) return false;
    } else {
      const want = pref.is?.visibilityConfigured;
      if (want !== undefined && (u.visibilityConfigured ?? false) !== want) return false;
    }
  }

  if (where['id'] && (where['id'] as { not: string }).not === u.id) return false;
  if (where['status'] !== undefined && where['status'] !== u.status) return false;
  if (where['identityVerifiedAt'] !== undefined && !u.identityVerified) return false;
  if (where['setupFeePaidAt'] !== undefined && !u.setupFeePaid) return false;
  if (where['isAnonymised'] === false && u.anonymised) return false;
  if (where['deletedAt'] === null && u.deleted) return false;

  const blocks = where['blocksInitiated'] as { none: { blockedId: string } } | undefined;
  if (blocks && storeRef.blockedPairs.has(pairKey(u.id, blocks.none.blockedId))) return false;
  const blockedBy = where['blockedBy'] as { none: { blockerId: string } } | undefined;
  if (blockedBy && storeRef.blockedPairs.has(pairKey(blockedBy.none.blockerId, u.id))) return false;

  throwOnUnmodelled(where, ['networthCategory', 'OR', 'visibilityCategories', 'partnerPreference', 'id', 'status', 'identityVerifiedAt', 'setupFeePaidAt', 'isAnonymised', 'deletedAt', 'blocksInitiated', 'blockedBy']);
  return true;
}

function pairKey(a: string, b: string): string {
  return `${a}>${b}`;
}

function matchesProfile(p: SeedProfile, where: Record<string, unknown>, store: FakePrisma): boolean {
  if (where['status'] !== undefined && where['status'] !== p.status) return false;
  if (where['visibility'] !== undefined && where['visibility'] !== p.visibility) return false;
  if (where['deletedAt'] === null && p.deleted) return false;

  const userWhere = where['user'] as { is: Record<string, unknown> } | undefined;
  if (!userWhere) throw new Error('double requires a user relation predicate');

  const owner = store.users.find((u) => u.id === p.userId)!;
  if (owner.id !== userWhere.is['id'] && (userWhere.is['id'] as { not: string }).not === owner.id) {
    return false;
  }
  return matchesUser(owner, userWhere.is, store);
}

/** Fails loudly if the service grows a predicate the double does not model. */
function throwOnUnmodelled(
  where: Record<string, unknown>,
  known: string[],
): void {
  for (const key of Object.keys(where)) {
    if (!known.includes(key)) {
      throw new Error(`FakePrisma does not model predicate "${key}" — extend the double.`);
    }
  }
}

describe('DiscoveryService', () => {
  let prisma: FakePrisma;
  let service: DiscoveryService;
  let preferences: { effectiveDiscoveryCategories: jest.Mock };

  const query = (over: Partial<DiscoveryQuery> = {}): DiscoveryQuery => ({
    limit: 20,
    use_saved_preference: true,
    sort: 'NEWEST_THEN_CLOSEST',
    ...over,
  });

  beforeEach(async () => {
    prisma = new FakePrisma();
    preferences = { effectiveDiscoveryCategories: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscoveryService,
        { provide: PrismaClient, useValue: prisma },
        {
          provide: StorageService,
          useValue: {
            presignDownload: jest.fn(async (key: string) => `https://cdn.test/${key}?sig=x`),
          },
        },
        { provide: VisibilityPreferenceService, useValue: preferences },
      ],
    }).compile();

    service = moduleRef.get(DiscoveryService);
  });

  /** A user + approved profile that passes every eligibility gate. */
  function seedEligible(
    id: string,
    band: string,
    opts: {
      visibilityConfigured?: boolean | null;
      visibleTo?: string[];
      createdAt?: string;
      photos?: SeedProfile['photos'];
      status?: SeedUser['status'];
      identityVerified?: boolean;
      setupFeePaid?: boolean;
    } = {},
  ) {
    prisma.users.push({
      id,
      band,
      status: opts.status ?? 'ACTIVE',
      identityVerified: opts.identityVerified ?? true,
      setupFeePaid: opts.setupFeePaid ?? true,
      anonymised: false,
      deleted: false,
      visibilityConfigured:
        opts.visibilityConfigured === undefined ? null : opts.visibilityConfigured,
      visibleTo: opts.visibleTo ?? [],
    });

    prisma.profiles.push({
      id: pid(id),
      userId: id,
      status: 'APPROVED',
      visibility: 'ACTIVE',
      deleted: false,
      createdAt: new Date(opts.createdAt ?? '2026-01-01T00:00:00Z'),
      photos: opts.photos ?? [],
    });
  }

  beforeEach(() => {
    // The viewer is always a row in the database; the service reads their own
    // band before deriving the scope.
    prisma.users.push({
      id: 'viewer',
      band: 'LOW',
      status: 'ACTIVE',
      identityVerified: true,
      setupFeePaid: true,
      anonymised: false,
      deleted: false,
      visibilityConfigured: null,
      visibleTo: [],
    });
    preferences.effectiveDiscoveryCategories.mockResolvedValue([]);
    prisma.pricing = [{ category: 'LOW', baseAmount: dec(99), gstRate: dec(0.18) }];
  });

  describe('an empty saved scope', () => {
    it('returns nothing and skips the database entirely', async () => {
      // The user saved "nobody". Answering here keeps a paused feed from looking
      // like a failed search, and avoids the most expensive query in the path.
      preferences.effectiveDiscoveryCategories.mockResolvedValue([]);
      const result = await service.search('viewer', query());

      expect(result).toEqual({
        items: [],
        next_cursor: null,
        applied_categories: [],
        preference_applied: true,
      });
      expect(prisma.profileFindManyCalls).toBe(0);
    });
  });

  describe('two-way scope', () => {
    beforeEach(() => {
      preferences.effectiveDiscoveryCategories.mockResolvedValue(['LOW', 'HIGH']);
      prisma.pricing = [
        { category: 'LOW', baseAmount: dec(99), gstRate: dec(0.18) },
        { category: 'HIGH', baseAmount: dec(249), gstRate: dec(0.18) },
      ];
    });

    it('includes a band whose members explicitly opted in to the viewer', async () => {
      seedEligible('a', 'HIGH', { visibilityConfigured: true, visibleTo: ['LOW'] });
      preferences.effectiveDiscoveryCategories.mockResolvedValue(['HIGH']);

      const result = await service.search('viewer', query());
      expect(result.applied_categories).toEqual(['HIGH']);
    });

    it('excludes a band whose members never accepted the viewer', async () => {
      // Same discover list, but nobody in HIGH allows LOW. One-sided opt-in is
      // not enough — that is the whole point of the rule.
      seedEligible('a', 'HIGH', { visibilityConfigured: true, visibleTo: ['MID'] });
      seedEligible('b', 'HIGH', { visibilityConfigured: true, visibleTo: ['MID'] });

      const result = await service.search('viewer', query());
      expect(result.applied_categories).toEqual([]);
    });

    it('counts a never-configured user as accepting their own band', async () => {
      seedEligible('a', 'LOW');
      const result = await service.search('viewer', query());
      expect(result.applied_categories).toEqual(['LOW']);
    });

    it('does not let a never-configured user widen their own band', async () => {
      // A HIGH user who never set the list is visible only from HIGH. Without
      // the `networthCategory === viewerBand` guard they would accept everyone.
      seedEligible('a', 'HIGH');
      preferences.effectiveDiscoveryCategories.mockResolvedValue(['LOW']);

      const result = await service.search('viewer', query());
      expect(result.applied_categories).toEqual([]);
    });

    it('honours a deliberately empty visible_to list', async () => {
      seedEligible('a', 'LOW', { visibilityConfigured: true, visibleTo: [] });
      const result = await service.search('viewer', query());
      expect(result.applied_categories).toEqual([]);
    });

    it('excludes a band with no active price rather than serving unquotable cards', async () => {
      // A card without a quote cannot be rendered, so reporting the band as
      // searched while omitting its users would claim coverage we do not have.
      seedEligible('a', 'LOW', { visibilityConfigured: true, visibleTo: ['LOW'] });
      seedEligible('b', 'HIGH', { visibilityConfigured: true, visibleTo: ['LOW'] });
      prisma.pricing = [{ category: 'LOW', baseAmount: dec(99), gstRate: dec(0.18) }];

      const result = await service.search('viewer', query());
      expect(result.applied_categories).toEqual(['LOW']);
      expect(result.items.map((c) => c.profile_id)).toEqual([pid('a')]);
    });
  });

  describe('the candidate query', () => {
    beforeEach(() => {
      preferences.effectiveDiscoveryCategories.mockResolvedValue(['LOW']);
    });

    it('restricts the query to the derived scope, not the raw preference list', async () => {
      seedEligible('a', 'LOW');
      await service.search('viewer', query());

      const where = prisma.lastProfileWhere as Record<string, unknown>;
      const user = (where['user'] as { is: Record<string, unknown> }).is;
      expect(user['networthCategory']).toEqual({ in: ['LOW'] });
    });

    it('carries every eligibility gate into the query', async () => {
      // These gates are the difference between a feed and a directory of every
      // registered account, so their presence in the query is asserted directly.
      seedEligible('a', 'LOW');
      await service.search('viewer', query());

      const where = prisma.lastProfileWhere as Record<string, unknown>;
      const user = (where['user'] as { is: Record<string, unknown> }).is;

      expect(where['status']).toBe('APPROVED');
      expect(where['visibility']).toBe('ACTIVE');
      expect(where['deletedAt']).toBeNull();
      expect(user['status']).toBe('ACTIVE');
      expect(user['identityVerifiedAt']).toEqual({ not: null });
      expect(user['setupFeePaidAt']).toEqual({ not: null });
      expect(user['isAnonymised']).toBe(false);
      expect(user['id']).toEqual({ not: 'viewer' });
      expect(user['blocksInitiated']).toEqual({ none: { blockedId: 'viewer' } });
      expect(user['blockedBy']).toEqual({ none: { blockerId: 'viewer' } });
    });

    it('omits a user who blocked the viewer', async () => {
      seedEligible('a', 'LOW');
      seedEligible('b', 'LOW');
      prisma.blockedPairs.add('b>viewer');

      const result = await service.search('viewer', query());
      expect(result.items.map((c) => c.profile_id)).toEqual([pid('a')]);
    });

    it('omits a user the viewer blocked', async () => {
      seedEligible('a', 'LOW');
      seedEligible('b', 'LOW');
      prisma.blockedPairs.add('viewer>b');

      const result = await service.search('viewer', query());
      expect(result.items.map((c) => c.profile_id)).toEqual([pid('a')]);
    });

    it('omits the viewer themselves', async () => {
      seedEligible('viewer', 'LOW');
      const result = await service.search('viewer', query());
      expect(result.items).toEqual([]);
    });

    it('omits a suspended account', async () => {
      seedEligible('a', 'LOW', { status: 'SUSPENDED' });
      expect((await service.search('viewer', query())).items).toEqual([]);
    });

    it('omits an unverified account', async () => {
      seedEligible('a', 'LOW', { identityVerified: false });
      expect((await service.search('viewer', query())).items).toEqual([]);
    });

    it('omits an account that has not paid the setup fee', async () => {
      seedEligible('a', 'LOW', { setupFeePaid: false });
      expect((await service.search('viewer', query())).items).toEqual([]);
    });

    it('omits a draft profile', async () => {
      seedEligible('a', 'LOW');
      prisma.profiles[0]!.status = 'DRAFT';
      expect((await service.search('viewer', query())).items).toEqual([]);
    });
  });

  describe('the card', () => {
    beforeEach(() => {
      preferences.effectiveDiscoveryCategories.mockResolvedValue(['LOW']);
    });

    it('sends only the fields the locked profile allows', async () => {
      // Section 12: the search response must not include locked fields. Asserted
      // as an exact key set so a field added to Profile later cannot leak in by
      // spreading the object.
      seedEligible('a', 'LOW');
      const card = (await service.search('viewer', query())).items[0]!;

      expect(Object.keys(card).sort()).toEqual([
        'photos',
        'profile_id',
        'profile_locked',
        'unlock_price',
      ]);
      expect(card.profile_locked).toBe(true);
    });

    it('prices by the target band, not the viewer band', async () => {
      // The two differ as a matter of course under two-way discovery; quoting the
      // viewer their own rate would make the price depend on who was looking.
      prisma.users.push({
        id: 'viewer',
        band: 'LOW',
        status: 'ACTIVE',
        identityVerified: true,
        setupFeePaid: true,
        anonymised: false,
        deleted: false,
        visibilityConfigured: null,
        visibleTo: [],
      });
      preferences.effectiveDiscoveryCategories.mockResolvedValue(['HIGH']);
      prisma.pricing = [
        { category: 'LOW', baseAmount: dec(99), gstRate: dec(0.18) },
        { category: 'HIGH', baseAmount: dec(249), gstRate: dec(0.18) },
      ];
      seedEligible('a', 'HIGH', { visibilityConfigured: true, visibleTo: ['LOW'] });

      const card = (await service.search('viewer', query())).items[0]!;
      expect(card.unlock_price.base_amount).toBe('249.00');
      expect(card.unlock_price.total_amount).toBe('293.82');
    });

    it('adds GST to the base price', async () => {
      seedEligible('a', 'LOW');
      const card = (await service.search('viewer', query())).items[0]!;
      expect(card.unlock_price).toEqual({
        base_amount: '99.00',
        gst_rate: '0.1800',
        gst_amount: '17.82',
        total_amount: '116.82',
        currency: 'INR',
      });
    });

    it('exposes approved photos only', async () => {
      seedEligible('a', 'LOW', {
        photos: [
          { id: 'ph1', objectKey: 'k1', widthPx: 800, heightPx: 600, isPrimary: true, photoType: 'SINGLE', status: 'APPROVED', sortOrder: 0 },
          { id: 'ph2', objectKey: 'k2', widthPx: 800, heightPx: 600, isPrimary: false, photoType: 'FAMILY', status: 'PENDING_REVIEW', sortOrder: 1 },
        ],
      });

      const card = (await service.search('viewer', query())).items[0]!;
      expect(card.photos.map((p) => p.photo_id)).toEqual(['ph1']);
      // The object key is never exposed; only a short-lived signed URL.
      expect(card.photos[0]!.url).toBe('https://cdn.test/k1?sig=x');
      expect(JSON.stringify(card)).not.toContain('objectKey');
    });

    it('drops a photo whose signing fails rather than failing the page', async () => {
      seedEligible('a', 'LOW', {
        photos: [
          { id: 'ph1', objectKey: 'bad', widthPx: 800, heightPx: 600, isPrimary: true, photoType: 'SINGLE', status: 'APPROVED', sortOrder: 0 },
        ],
      });
      const moduleRef = await Test.createTestingModule({
        providers: [
          DiscoveryService,
          { provide: PrismaClient, useValue: prisma },
          {
            provide: StorageService,
            useValue: { presignDownload: jest.fn().mockRejectedValue(new Error('expired key')) },
          },
          { provide: VisibilityPreferenceService, useValue: preferences },
        ],
      }).compile();

      const result = await moduleRef.get(DiscoveryService).search('viewer', query());
      expect(result.items[0]!.photos).toEqual([]);
    });
  });

  describe('pagination', () => {
    beforeEach(() => {
      preferences.effectiveDiscoveryCategories.mockResolvedValue(['LOW']);
    });

    it('orders newest first', async () => {
      seedEligible('a', 'LOW', { createdAt: '2026-01-01T00:00:00Z' });
      seedEligible('b', 'LOW', { createdAt: '2026-06-01T00:00:00Z' });

      const result = await service.search('viewer', query());
      expect(result.items.map((c) => c.profile_id)).toEqual([pid('b'), pid('a')]);
    });

    it('returns a cursor only when more rows remain', async () => {
      seedEligible('a', 'LOW');
      seedEligible('b', 'LOW');

      expect((await service.search('viewer', query({ limit: 1 }))).next_cursor).toBeTruthy();
      expect((await service.search('viewer', query({ limit: 20 }))).next_cursor).toBeNull();
    });

    it('resumes after the cursor rather than repeating the last item', async () => {
      seedEligible('a', 'LOW', { createdAt: '2026-01-01T00:00:00Z' });
      seedEligible('b', 'LOW', { createdAt: '2026-06-01T00:00:00Z' });
      seedEligible('c', 'LOW', { createdAt: '2026-09-01T00:00:00Z' });

      const first = await service.search('viewer', query({ limit: 1 }));
      const second = await service.search('viewer', query({ limit: 1, cursor: first.next_cursor! }));

      expect(first.items.map((c) => c.profile_id)).toEqual([pid('c')]);
      expect(second.items.map((c) => c.profile_id)).toEqual([pid('b')]);
    });

    it('starts from the beginning on a malformed cursor instead of erroring', async () => {
      // The token is the client's own; rejecting it would show an empty screen
      // where the first page would have worked.
      seedEligible('a', 'LOW');
      const result = await service.search('viewer', query({ cursor: 'not-a-cursor' }));
      expect(result.items.map((c) => c.profile_id)).toEqual([pid('a')]);
    });
  });

  describe('use_saved_preference', () => {
    beforeEach(() => {
      preferences.effectiveDiscoveryCategories.mockResolvedValue(['LOW']);
    });

    it('does not widen the scope when the client sends false', async () => {
      // The per-request category is rejected at the contract precisely so scope
      // cannot be widened for one call. Treating this flag as "ignore my saved
      // preference" would be the same bypass by another name.
      seedEligible('a', 'LOW');

      const optedOut = await service.search('viewer', query({ use_saved_preference: false }));

      expect(optedOut.items.map((c) => c.profile_id)).toEqual([pid('a')]);
      expect(optedOut.applied_categories).toEqual(['LOW']);
    });

    it('still reports preference_applied, because the scope did use it', async () => {
      // Echoing the request flag back would claim preferences were skipped while
      // every returned card had been filtered by them.
      seedEligible('a', 'LOW');

      const result = await service.search('viewer', query({ use_saved_preference: false }));

      expect(result.preference_applied).toBe(true);
    });
  });
});