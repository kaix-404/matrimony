import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ProfileService } from './profile.service';
import { PhotoService } from './photo.service';
import { MasterDataService, BadMasterListValueError } from '../master-data/master-data.service';
import { StorageService } from '../storage/s3.service';
import { ProfileStatus, PrismaClient } from '../prisma/prisma-client';
import type { CreateProfileInput } from '@matrimony/shared';

/**
 * Doubles for the profile store.
 *
 * These model the parts of Prisma the service's correctness depends on:
 * `findUnique` returning null for an absent row, and `update` writing only the
 * keys it is given. That second part is the whole test — the service claims an
 * absent PATCH key is left alone, and a double that filled in the blanks would
 * make that claim unfalsifiable.
 */
type Row = Record<string, unknown>;

class FakePrisma {
  /** The stored profile row. Named apart from the `profile` delegate below,
   * because Prisma's model accessors and the rows they return are different
   * things and conflating them in a double hides real mistakes. */
  profileRow: Row | null = null;
  photoRows: Row[] = [];
  userStatusValue = 'PENDING_VERIFICATION';
  userDeletedAt: Date | null = null;
  /** Captures the data passed to the last update, to inspect what was written. */
  lastUpdateData: Row | null = null;
  createCount = 0;

  user = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      if (where.id !== 'u1') return null;
      return { status: this.userStatusValue, deletedAt: this.userDeletedAt };
    },
  };

  profile = {
    findUnique: async ({ where }: { where: { userId?: string; id?: string } }) => {
      if (!this.profileRow) return null;
      if (where.userId && where.userId !== 'u1') return null;
      return this.profileRow;
    },
    findFirst: async () => null,
    create: async ({ data }: { data: Row }) => {
      this.createCount += 1;
      if (this.profileRow) throw new Error('unique constraint');
      this.profileRow = {
        id: 'p1',
        firstName: 'Aarti',
        lastName: null,
        gender: 'FEMALE',
        dateOfBirth: new Date('1994-06-15T00:00:00.000Z'),
        timeOfBirth: null,
        placeOfBirth: null,
        heightCm: null,
        maritalStatus: null,
        religion: null,
        communityValue: null,
        motherTongue: null,
        swagotra: null,
        maternalGothra: null,
        rashi: null,
        nakshatra: null,
        gan: null,
        manglikStatus: null,
        educationValue: null,
        professionValue: null,
        company: null,
        annualIncome: null,
        workLocation: null,
        fathersOccupation: null,
        mothersOccupation: null,
        siblings: null,
        familyLocation: null,
        familyDescription: null,
        foodPreference: null,
        smoking: null,
        drinking: null,
        aboutMe: null,
        country: null,
        state: null,
        city: null,
        status: 'DRAFT',
        visibility: 'ACTIVE',
        user: { networthCategory: 'TWO_CR_TO_FIVE_CR' },
        ...data,
      };
      return this.profileRow;
    },
    update: async ({ data }: { data: Row }) => {
      this.lastUpdateData = data;
      // Only the keys actually supplied are written. This is the behaviour the
      // partial-update guarantee rests on.
      for (const [key, value] of Object.entries(data)) {
        this.profileRow![key] = value;
      }
      return this.profileRow;
    },
  };

  profilePhoto = {
    findMany: async () => this.photoRows,
    count: async () => this.photoRows.length,
    create: async ({ data }: { data: Row }) => {
      const row = { id: `ph${this.photoRows.length + 1}`, createdAt: new Date(), ...data };
      this.photoRows.push(row);
      return row;
    },
    findFirst: async ({
      where,
    }: {
      where: { objectKey?: string; id?: string; profileId?: string; status?: { not?: string } };
    }) => {
      // Models the two shapes the service queries with: a specific row by id or
      // object key, and "the next surviving photo" — which is ordered by
      // sortOrder and excludes rejected rows. Returning a row for the second
      // shape regardless of the filter would make the promotion logic untestable.
      let rows = this.photoRows;
      if (where.objectKey) return rows.find((r) => r.objectKey === where.objectKey) ?? null;
      if (where.id) return rows.find((r) => r.id === where.id) ?? null;
      if (where.profileId) rows = rows.filter((r) => r.profileId === where.profileId);
      if (where.status?.not) rows = rows.filter((r) => r.status !== where.status.not);
      const ordered = [...rows].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
      return ordered[0] ?? null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = this.photoRows.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ data }: { data: Row }) => {
      this.photoRows.forEach((r) => Object.assign(r, data));
      return { count: this.photoRows.length };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      this.photoRows = this.photoRows.filter((r) => r.id !== where.id);
    },
  };

  $transaction = async (arg: Row[] | ((tx: FakePrisma) => Promise<unknown>)) => {
    if (typeof arg === 'function') return arg(this);
    return Promise.all(arg);
  };
}

class FakeMasterData {
  values = new Map<string, { id: string; listKey: string; isActive: boolean; value: string }>();
  calls: unknown[] = [];

  resolveForProfile = async (input: {
    education_id?: string | null;
    profession_id?: string | null;
    community_id?: string | null;
  }) => {
    this.calls.push(input);
    const out: Record<string, string> = {};
    for (const [field, listKey] of [
      ['education_id', 'EDUCATION'],
      ['profession_id', 'PROFESSION'],
      ['community_id', 'COMMUNITY'],
    ] as const) {
      const id = input[field];
      if (id === undefined || id === null) continue;
      const row = this.values.get(id);
      if (!row || row.listKey !== listKey || !row.isActive) {
        throw new BadMasterListValueError(field, id);
      }
      out[`${field.replace('_id', '')}Id`] = row.id;
    }
    return out;
  };
}

class FakeStorage {
  presigned: string[] = [];
  presignUpload = async (key: string, mime: string) => {
    this.presigned.push(`${key}:${mime}`);
    return `https://storage.test/${key}?signed=upload`;
  };
  presignDownload = async (key: string) => `https://storage.test/${key}?signed=read`;
}

describe('ProfileService', () => {
  let prisma: FakePrisma;
  let masterData: FakeMasterData;
  let service: ProfileService;

  const base: CreateProfileInput = {
    first_name: 'Aarti',
    gender: 'FEMALE',
    date_of_birth: '1994-06-15',
  };

  beforeEach(async () => {
    prisma = new FakePrisma();
    masterData = new FakeMasterData();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: PrismaClient, useValue: prisma },
        { provide: MasterDataService, useValue: masterData },
        { provide: StorageService, useValue: new FakeStorage() },
      ],
    }).compile();
    service = moduleRef.get(ProfileService);
  });

  it('creates a minimal profile', async () => {
    const result = await service.create('u1', base);
    expect(result.first_name).toBe('Aarti');
    expect(result.status).toBe('DRAFT');
  });

  it('echoes the category read-only and never accepts one', async () => {
    const result = await service.create('u1', base);
    expect(result.networth_category).toBe('TWO_CR_TO_FIVE_CR');

    // Even at the service boundary — below the schema — there is no argument
    // through which a category could be written. The B1 rule has no code path.
    const source = (ProfileService.prototype.create as unknown as { length: number }).length;
    expect(source).toBe(2);
  });

  it('stores the date of birth as the calendar date entered', async () => {
    await service.create('u1', base);
    // A timezone that would shift the day if the date were built locally.
    expect((prisma.profileRow!['dateOfBirth'] as Date).toISOString()).toBe(
      '1994-06-15T00:00:00.000Z',
    );
  });

  it('refuses a second create rather than overwriting', async () => {
    await service.create('u1', base);
    await expect(service.create('u1', base)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an unknown, retired or wrong-list master value', async () => {
    masterData.values.set('x', { id: 'x', listKey: 'CASTE', isActive: true, value: 'Brahmin' });
    await expect(service.create('u1', { ...base, education_id: 'x' })).rejects.toThrow(
      /Validation failed/,
    );
  });

  describe('partial update', () => {
    beforeEach(async () => {
      await service.create('u1', { ...base, city: 'Pune', company: 'Infosys' });
      prisma.lastUpdateData = null;
    });

    it('leaves an absent field untouched', async () => {
      await service.update('u1', { company: 'Wipro' });
      expect(prisma.profileRow!['company']).toBe('Wipro');
      // The field the caller did not mention must survive.
      expect(prisma.profileRow!['city']).toBe('Pune');
    });

    it('writes no key at all for an absent field', async () => {
      await service.update('u1', { company: 'Wipro' });
      // Not merely equal in value: absent from the update entirely, so there is
      // no window in which a null could land on an unsent column.
      expect(Object.keys(prisma.lastUpdateData ?? {})).not.toContain('city');
    });

    it('clears a field only when null is sent explicitly', async () => {
      await service.update('u1', { company: null });
      expect(prisma.profileRow!['company']).toBeNull();
      expect(prisma.profileRow!['city']).toBe('Pune');
    });

    it('returns the profile to DRAFT, because approval was for the old content', async () => {
      prisma.profileRow!['status'] = ProfileStatus.APPROVED;
      await service.update('u1', { about_me: 'Updated bio' });
      expect(prisma.profileRow!['status']).toBe(ProfileStatus.DRAFT);
    });

    it('clears a prior rejection reason when the user edits', async () => {
      prisma.profileRow!['rejectionReason'] = 'Blurry photo';
      await service.update('u1', { about_me: 'Fixed' });
      expect(prisma.profileRow!['rejectionReason']).toBeNull();
    });

    it('does not touch a master-list column when no master field was sent', async () => {
      masterData.values.set('e1', {
        id: 'e1',
        listKey: 'EDUCATION',
        isActive: true,
        value: 'B.Tech',
      });
      await service.update('u1', { education_id: 'e1' });
      expect(prisma.profileRow!['educationId']).toBe('e1');

      prisma.lastUpdateData = null;
      await service.update('u1', { city: 'Mumbai' });
      expect(Object.keys(prisma.lastUpdateData ?? {})).not.toContain('educationId');
    });
  });

  describe('account state', () => {
    beforeEach(async () => {
      await service.create('u1', base);
    });

    it('blocks edits while suspended', async () => {
      prisma.userStatusValue = 'SUSPENDED';
      await expect(service.update('u1', { city: 'Pune' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('blocks a soft-deleted account even when its status still says active', async () => {
      prisma.userStatusValue = 'ACTIVE';
      prisma.userDeletedAt = new Date();
      await expect(service.update('u1', { city: 'Pune' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('still lets a suspended user read their own profile', async () => {
      // Hiding data from a user the business has suspended is not the same as
      // preventing them changing it.
      prisma.userStatusValue = 'SUSPENDED';
      await expect(service.myProfile('u1')).resolves.toMatchObject({ first_name: 'Aarti' });
    });
  });

  describe('completeness', () => {
    it('is complete once the three non-nullable fields are set', async () => {
      await service.create('u1', base);
      await expect(service.completeness('u1')).resolves.toEqual({
        is_complete: true,
        missing_fields: [],
      });
    });

    it('does not demand a bio, since the client has not called it mandatory', async () => {
      await service.create('u1', base);
      const result = await service.completeness('u1');
      expect(result.missing_fields).not.toContain('about_me');
      expect(result.missing_fields).not.toContain('family_description');
    });
  });

  it('404s an unknown user rather than creating an orphan profile', async () => {
    await expect(service.create('nobody', base)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PhotoService', () => {
  let prisma: FakePrisma;
  let service: PhotoService;
  let profiles: { ownPhotos: (id: string) => Promise<unknown[]> };

  beforeEach(async () => {
    prisma = new FakePrisma();
    prisma.profileRow = { id: 'p1', userId: 'u1' };
    profiles = {
      ownPhotos: async () =>
        prisma.photoRows.map((r) => ({ photo_id: r.id, object_key: r.objectKey })),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PhotoService,
        { provide: PrismaClient, useValue: prisma },
        { provide: StorageService, useValue: new FakeStorage() },
        { provide: ProfileService, useValue: profiles },
      ],
    }).compile();
    service = moduleRef.get(PhotoService);
  });

  it('mints an upload URL bound to the declared content type', async () => {
    const result = await service.initiate('u1', {
      mime_type: 'image/jpeg',
      byte_size: 1024,
      photo_type: 'SINGLE',
    });
    expect(result.object_key).toMatch(/^profiles\/p1\/[0-9a-f]{32}$/);
    expect(result.upload_url).toContain('signed=upload');
  });

  it('rejects SVG, which would be stored XSS served from our own origin', async () => {
    await expect(
      service.initiate('u1', {
        mime_type: 'image/svg+xml' as never,
        byte_size: 1024,
        photo_type: 'SINGLE',
      }),
    ).rejects.toThrow(/JPEG, PNG or WebP/);
  });

  it('rejects a photo over 5 MB', async () => {
    await expect(
      service.initiate('u1', {
        mime_type: 'image/jpeg',
        byte_size: 6 * 1024 * 1024,
        photo_type: 'SINGLE',
      }),
    ).rejects.toThrow(/5 MB/);
  });

  it('caps the number of photos', async () => {
    prisma.photoRows = Array.from({ length: 6 }, (_, i) => ({ id: `ph${i}` }));
    await expect(
      service.initiate('u1', { mime_type: 'image/jpeg', byte_size: 100, photo_type: 'SINGLE' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('records family photos distinctly, since a family photo has several faces', async () => {
    await service.initiate('u1', { mime_type: 'image/png', byte_size: 100, photo_type: 'FAMILY' });
    expect(prisma.photoRows[0]['photoType']).toBe('FAMILY');
  });

  it('starts every upload at PENDING_REVIEW, so nothing is visible before moderation', async () => {
    await service.initiate('u1', { mime_type: 'image/jpeg', byte_size: 100, photo_type: 'SINGLE' });
    expect(prisma.photoRows[0]['status']).toBe('PENDING_REVIEW');
  });

  it('refuses to complete a key that was never reserved', async () => {
    await expect(
      service.complete('u1', { object_key: 'profiles/p1/never', width_px: 100, height_px: 100 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts dimensions on complete', async () => {
    const { object_key } = await service.initiate('u1', {
      mime_type: 'image/jpeg',
      byte_size: 100,
      photo_type: 'SINGLE',
    });
    await service.complete('u1', { object_key, width_px: 800, height_px: 600 });
    expect(prisma.photoRows[0]['widthPx']).toBe(800);
  });

  it('demotes the previous primary when a new one is set', async () => {
    await service.initiate('u1', { mime_type: 'image/jpeg', byte_size: 100, photo_type: 'SINGLE' });
    await service.initiate('u1', { mime_type: 'image/jpeg', byte_size: 100, photo_type: 'SINGLE' });
    prisma.photoRows[0]['isPrimary'] = true;

    await service.setPrimary('u1', prisma.photoRows[1]['id'] as string);
    expect(prisma.photoRows[0]['isPrimary']).toBe(false);
    expect(prisma.photoRows[1]['isPrimary']).toBe(true);
  });

  it('promotes a survivor when the primary is deleted, so cards still have a first photo', async () => {
    await service.initiate('u1', { mime_type: 'image/jpeg', byte_size: 100, photo_type: 'SINGLE' });
    await service.initiate('u1', { mime_type: 'image/jpeg', byte_size: 100, photo_type: 'SINGLE' });
    prisma.photoRows[0]['isPrimary'] = true;

    await service.remove('u1', prisma.photoRows[0]['id'] as string);
    expect(prisma.photoRows).toHaveLength(1);
    expect(prisma.photoRows[0]['isPrimary']).toBe(true);
  });
});
