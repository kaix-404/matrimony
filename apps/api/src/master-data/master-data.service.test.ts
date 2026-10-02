import { Test } from '@nestjs/testing';
import { MasterDataService } from './master-data.service';
import { PrismaClient } from '../prisma/prisma-client';

type Row = Record<string, unknown>;

/**
 * Doubles for the master-list store.
 *
 * `findFirst` is given real predicate semantics for `listKey` and `isActive`,
 * because the guarantee under test is precisely that a value is only accepted
 * from its own list and only while active. A double that ignored the predicate
 * would let the service look correct while the rule did not exist.
 */
class FakePrisma {
  lists: Row[] = [
    {
      key: 'EDUCATION',
      label: 'Education',
      isSensitive: false,
      sortOrder: 1,
      values: [
        { id: 'e1', value: 'B.Tech', isActive: true, sortOrder: 1 },
        { id: 'e2', value: 'Retired value', isActive: false, sortOrder: 2 },
      ],
    },
    {
      key: 'PROFESSION',
      label: 'Profession',
      isSensitive: false,
      sortOrder: 2,
      values: [{ id: 'p1', value: 'Engineer', isActive: true, sortOrder: 1 }],
    },
    {
      key: 'COMMUNITY',
      label: 'Community',
      isSensitive: true,
      sortOrder: 4,
      values: [{ id: 'c1', value: 'Aggarwal', isActive: true, sortOrder: 1 }],
    },
  ];

  masterList = {
    findMany: async ({
      where,
      select,
    }: {
      where: { key: { in: string[] } };
      select: { values: { where: { isActive: boolean } } };
    }) => {
      // The nested `where` on the relation is applied, because omitting a
      // retired value is the service's job expressed as a query and a double
      // that ignored it would make this test pass for the wrong reason.
      return this.lists
        .filter((l) => where.key.in.includes(l['key'] as string))
        .map((l) => ({
          ...l,
          values: (l['values'] as Row[]).filter(
            (v) => v['isActive'] === select.values.where.isActive,
          ),
        }));
    },
  };

  masterListValue = {
    findFirst: async ({ where }: { where: { id: string; listKey: string; isActive: boolean } }) => {
      for (const list of this.lists) {
        if (list['key'] !== where.listKey) continue;
        const value = (list['values'] as Row[]).find((v) => v['id'] === where.id);
        if (!value) continue;
        return where.isActive === false || value['isActive'] === false ? null : value;
      }
      return null;
    },
  };
}

describe('MasterDataService', () => {
  let prisma: FakePrisma;
  let service: MasterDataService;

  beforeEach(async () => {
    prisma = new FakePrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [MasterDataService, { provide: PrismaClient, useValue: prisma }],
    }).compile();
    service = moduleRef.get(MasterDataService);
  });

  it('serves the seeded lists in a stable order', async () => {
    const { lists } = await service.lists();
    expect(lists.map((l) => l.key)).toEqual(['EDUCATION', 'PROFESSION', 'COMMUNITY']);
  });

  it('omits a retired value rather than offering it', async () => {
    const { lists } = await service.lists();
    const education = lists.find((l) => l.key === 'EDUCATION')!;
    expect(education.values.map((v) => v.id)).toEqual(['e1']);
  });

  it('flags caste and community as sensitive but education as not', async () => {
    const { lists } = await service.lists();
    const byKey = Object.fromEntries(lists.map((l) => [l.key, l.is_sensitive]));
    expect(byKey['EDUCATION']).toBe(false);
    expect(byKey['COMMUNITY']).toBe(true);
  });

  it('accepts an active id from the matching list', async () => {
    const result = await service.resolveForProfile({ education_id: 'e1' });
    expect(result.educationId).toBe('e1');
    expect(result.educationValue).toBe('B.Tech');
  });

  it('rejects a retired value', async () => {
    await expect(service.resolveForProfile({ education_id: 'e2' })).rejects.toThrow(
      /Unknown or inactive/,
    );
  });

  it('rejects an id belonging to a different list', async () => {
    // A caste/community value submitted as an education level, which a
    // per-field lookup that ignored `listKey` would happily accept.
    await expect(service.resolveForProfile({ education_id: 'c1' })).rejects.toThrow(
      /Unknown or inactive/,
    );
  });

  it('rejects an id that does not exist', async () => {
    await expect(service.resolveForProfile({ education_id: 'nope' })).rejects.toThrow(
      /Unknown or inactive/,
    );
  });

  it('names the offending field so the app can point at the dropdown', async () => {
    await expect(service.resolveForProfile({ community_id: 'e1' })).rejects.toThrow(/community_id/);
  });

  it('treats absent as untouched and null as clear, resolving neither', async () => {
    expect(await service.resolveForProfile({})).toEqual({});
    expect(await service.resolveForProfile({ education_id: null })).toEqual({});
  });

  it('resolves several fields at once', async () => {
    const result = await service.resolveForProfile({
      education_id: 'e1',
      profession_id: 'p1',
      community_id: 'c1',
    });
    expect(result).toMatchObject({
      educationId: 'e1',
      professionId: 'p1',
      communityId: 'c1',
    });
  });
});
