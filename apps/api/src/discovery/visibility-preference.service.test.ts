import { Test } from '@nestjs/testing';
import { PrismaClient } from '../prisma/prisma-client';
import {
  UnknownCategoryError,
  VisibilityPreferenceService,
} from './visibility-preference.service';

type Row = Record<string, unknown>;

/**
 * In-memory stand-in for the preference tables.
 *
 * Models the two join tables, the PartnerPreference flag row, and the band
 * reference. `$transaction` runs the callback against the same store with no
 * isolation, which is enough: the assertions here are about which rows end up
 * present and which flags get set, not about concurrency.
 */
class FakePrisma {
  users = new Map<string, Row>();
  discoveryRows: Row[] = [];
  visibilityRows: Row[] = [];
  partnerPreferences = new Map<string, Row>();
  bands: Row[] = [
    { key: 'BELOW_2CR', isActive: true },
    { key: 'TWO_CR_TO_FIVE_CR', isActive: true },
    { key: 'FIVE_CR_TO_TEN_CR', isActive: true },
    { key: 'PENDING_REVIEW', isActive: true },
    { key: 'RETIRED_BAND', isActive: false },
  ];

  user = {
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const row = this.users.get(where.id);
      if (!row) throw new Error(`no user ${where.id}`);
      // The relation arrays are derived from the join tables on every read, the
      // way Prisma resolves a relation. Caching them on the user row would make
      // a write invisible to the next read and let every persistence assertion
      // pass for the wrong reason.
      return {
        ...row,
        partnerPreference: this.partnerPreferences.get(where.id) ?? null,
        discoveryCategories: this.discoveryRows
          .filter((r) => r['userId'] === where.id)
          .map((r) => ({ category: r['category'] })),
        visibilityCategories: this.visibilityRows
          .filter((r) => r['userId'] === where.id)
          .map((r) => ({ category: r['category'] })),
      };
    },
  };

  netWorthCategoryRef = {
    findMany: async ({ where }: { where: { key: { in: string[] }; isActive: boolean } }) =>
      this.bands.filter(
        (b) => where.key.in.includes(b['key'] as string) && b['isActive'] === where.isActive,
      ),
  };

  userDiscoveryCategory = {
    deleteMany: async ({ where }: { where: { userId: string } }) => {
      this.discoveryRows = this.discoveryRows.filter((r) => r['userId'] !== where.userId);
    },
    createMany: async ({ data }: { data: Row[] }) => {
      this.discoveryRows.push(...data);
    },
  };

  userVisibilityCategory = {
    deleteMany: async ({ where }: { where: { userId: string } }) => {
      this.visibilityRows = this.visibilityRows.filter((r) => r['userId'] !== where.userId);
    },
    createMany: async ({ data }: { data: Row[] }) => {
      this.visibilityRows.push(...data);
    },
  };

  partnerPreference = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { userId: string };
      create: Row;
      update: Row;
    }) => {
      const existing = this.partnerPreferences.get(where.userId);
      const next = { ...(existing ?? create), ...update, updatedAt: new Date('2026-01-01') };
      this.partnerPreferences.set(where.userId, next);
      return next;
    },
  };

  $transaction = async (fn: (tx: FakePrisma) => Promise<unknown>) => fn(this);

  /** Seeds a user with an optional saved preference state. */
  addUser(id: string, networthCategory: string, prefs?: { discover?: string[]; visibleTo?: string[] }) {
    this.users.set(id, {
      id,
      networthCategory,
      partnerPreference: null,
    });

    if (prefs?.discover !== undefined) {
      this.discoveryRows.push(...prefs.discover.map((category) => ({ userId: id, category })));
    }
    if (prefs?.visibleTo !== undefined) {
      this.visibilityRows.push(...prefs.visibleTo.map((category) => ({ userId: id, category })));
    }

    if (prefs) {
      this.partnerPreferences.set(id, {
        userId: id,
        discoveryConfigured: prefs.discover !== undefined,
        visibilityConfigured: prefs.visibleTo !== undefined,
        updatedAt: new Date('2026-01-01'),
      });
    }
  }
}

describe('VisibilityPreferenceService', () => {
  let prisma: FakePrisma;
  let service: VisibilityPreferenceService;

  beforeEach(async () => {
    prisma = new FakePrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [VisibilityPreferenceService, { provide: PrismaClient, useValue: prisma }],
    }).compile();
    service = moduleRef.get(VisibilityPreferenceService);
  });

  describe('the default when nothing is saved', () => {
    it('discovers only the own band before any save', async () => {
      prisma.addUser('u1', 'TWO_CR_TO_FIVE_CR');
      expect(await service.effectiveDiscoveryCategories('u1')).toEqual(['TWO_CR_TO_FIVE_CR']);
    });

    it('is visible only to the own band before any save', async () => {
      prisma.addUser('u1', 'TWO_CR_TO_FIVE_CR');
      expect(await service.effectiveVisibilityCategories('u1')).toEqual(['TWO_CR_TO_FIVE_CR']);
    });

    it('reports both lists as unconfigured and empty', async () => {
      prisma.addUser('u1', 'TWO_CR_TO_FIVE_CR');
      const state = await service.getState('u1');
      expect(state.discovery_configured).toBe(false);
      expect(state.visibility_configured).toBe(false);
      expect(state.discover).toEqual([]);
      expect(state.visible_to).toEqual([]);
      expect(state.own_category).toBe('TWO_CR_TO_FIVE_CR');
      expect(state.updated_at).toBeNull();
    });
  });

  describe('save', () => {
    it('persists both lists and marks them configured', async () => {
      prisma.addUser('u1', 'TWO_CR_TO_FIVE_CR');
      const state = await service.save('u1', {
        discover: ['TWO_CR_TO_FIVE_CR', 'FIVE_CR_TO_TEN_CR'],
        visible_to: ['BELOW_2CR'],
      });
      expect(state.discover).toEqual(['TWO_CR_TO_FIVE_CR', 'FIVE_CR_TO_TEN_CR']);
      expect(state.visible_to).toEqual(['BELOW_2CR']);
      expect(state.discovery_configured).toBe(true);
      expect(state.visibility_configured).toBe(true);
    });

    it('treats an empty list as a deliberate nobody, not unconfigured', async () => {
      // This is the distinction the flags exist for: empty means "pause", and
      // collapsing it into "unset" would silently default back to own-band.
      prisma.addUser('u1', 'TWO_CR_TO_FIVE_CR');
      const state = await service.save('u1', { discover: [] });
      expect(state.discover).toEqual([]);
      expect(state.discovery_configured).toBe(true);
      expect(await service.effectiveDiscoveryCategories('u1')).toEqual([]);
    });

    it('leaves the unsubmitted direction untouched on a partial save', async () => {
      prisma.addUser('u1', 'TWO_CR_TO_FIVE_CR', { visibleTo: ['BELOW_2CR'] });
      await service.save('u1', { discover: ['FIVE_CR_TO_TEN_CR'] });
      const state = await service.getState('u1');
      expect(state.discover).toEqual(['FIVE_CR_TO_TEN_CR']);
      expect(state.visible_to).toEqual(['BELOW_2CR']);
    });

    it('replaces rather than accumulates the submitted direction', async () => {
      prisma.addUser('u1', 'TWO_CR_TO_FIVE_CR', { discover: ['BELOW_2CR', 'FIVE_CR_TO_TEN_CR'] });
      const state = await service.save('u1', { discover: ['TWO_CR_TO_FIVE_CR'] });
      expect(state.discover).toEqual(['TWO_CR_TO_FIVE_CR']);
    });

    it('de-duplicates a repeated key', async () => {
      prisma.addUser('u1', 'TWO_CR_TO_FIVE_CR');
      const state = await service.save('u1', {
        discover: ['BELOW_2CR', 'BELOW_2CR'],
      });
      expect(state.discover).toEqual(['BELOW_2CR']);
    });

    it('rejects the review bucket', async () => {
      prisma.addUser('u1', 'TWO_CR_TO_FIVE_CR');
      await expect(service.save('u1', { discover: ['PENDING_REVIEW'] })).rejects.toThrow(
        UnknownCategoryError,
      );
    });

    it('rejects a band that does not exist', async () => {
      prisma.addUser('u1', 'TWO_CR_TO_FIVE_CR');
      await expect(service.save('u1', { visible_to: ['MADE_UP_BAND'] })).rejects.toThrow(
        /Unknown net-worth category/,
      );
    });

    it('rejects a retired band', async () => {
      prisma.addUser('u1', 'TWO_CR_TO_FIVE_CR');
      await expect(service.save('u1', { discover: ['RETIRED_BAND'] })).rejects.toThrow(
        UnknownCategoryError,
      );
    });

    it('writes nothing when a band is rejected', async () => {
      prisma.addUser('u1', 'TWO_CR_TO_FIVE_CR');
      await expect(service.save('u1', { discover: ['MADE_UP_BAND'] })).rejects.toThrow();
      expect(prisma.discoveryRows).toEqual([]);
    });

    it('upserts the flag row for a user with no existing preference', async () => {
      prisma.addUser('u1', 'TWO_CR_TO_FIVE_CR');
      await service.save('u1', { discover: ['BELOW_2CR'] });
      const pref = prisma.partnerPreferences.get('u1')!;
      expect(pref['discoveryConfigured']).toBe(true);
      expect(pref['visibilityConfigured']).toBeUndefined();
    });
  });

  describe('isDiscoverableBy (two-way)', () => {
    it('allows a pair whose bands both selected each other', async () => {
      prisma.addUser('v', 'TWO_CR_TO_FIVE_CR', { discover: ['FIVE_CR_TO_TEN_CR'] });
      prisma.addUser('t', 'FIVE_CR_TO_TEN_CR', { visibleTo: ['TWO_CR_TO_FIVE_CR'] });
      expect(await service.isDiscoverableBy('v', 't')).toBe(true);
    });

    it('blocks when the viewer did not select the target band, even if the target allowed them', async () => {
      // One-sided opt-in is not enough; this is the whole point of the two-way rule.
      prisma.addUser('v', 'TWO_CR_TO_FIVE_CR', { discover: ['BELOW_2CR'] });
      prisma.addUser('t', 'FIVE_CR_TO_TEN_CR', { visibleTo: ['TWO_CR_TO_FIVE_CR'] });
      expect(await service.isDiscoverableBy('v', 't')).toBe(false);
    });

    it('blocks when the target did not select the viewer band', async () => {
      prisma.addUser('v', 'TWO_CR_TO_FIVE_CR', { discover: ['FIVE_CR_TO_TEN_CR'] });
      prisma.addUser('t', 'FIVE_CR_TO_TEN_CR', { visibleTo: ['BELOW_2CR'] });
      expect(await service.isDiscoverableBy('v', 't')).toBe(false);
    });

    it('falls back to own-band defaults for users with no saves', async () => {
      prisma.addUser('v', 'TWO_CR_TO_FIVE_CR');
      prisma.addUser('t', 'TWO_CR_TO_FIVE_CR');
      expect(await service.isDiscoverableBy('v', 't')).toBe(true);
    });

    it('blocks when the target paused discovery with an empty list', async () => {
      prisma.addUser('v', 'TWO_CR_TO_FIVE_CR');
      prisma.addUser('t', 'TWO_CR_TO_FIVE_CR', { visibleTo: [] });
      expect(await service.isDiscoverableBy('v', 't')).toBe(false);
    });

    it('never treats a user as their own match', async () => {
      prisma.addUser('u1', 'TWO_CR_TO_FIVE_CR');
      expect(await service.isDiscoverableBy('u1', 'u1')).toBe(false);
    });
  });
});