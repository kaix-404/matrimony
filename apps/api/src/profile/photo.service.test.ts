import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PhotoService } from './photo.service';
import { ProfileService } from './profile.service';
import { StorageService } from '../storage/s3.service';
import { PrismaClient } from '../prisma/prisma-client';

/**
 * The website's photo upload path.
 *
 * `uploadBytes` stores a file the API received itself, so its correctness is
 * entirely about the reservation made by `initiate`: the key must be the caller's,
 * the content type must be the one reserved, and the bytes must fit the size that
 * was reserved. The fakes below make each of those refusals observable — a write
 * that should not have happened is visible in `writes`, and a key that is not
 * this profile's simply does not resolve.
 */
type Row = { objectKey: string; profileId: string; mimeType: string; byteSize: number };

class FakePrisma {
  rows: Row[] = [
    { objectKey: 'profiles/p1/abc', profileId: 'p1', mimeType: 'image/jpeg', byteSize: 10 },
  ];

  profile = {
    findUnique: async ({ where }: { where: { userId: string } }) =>
      where.userId === 'u1' ? { id: 'p1' } : null,
  };

  profilePhoto = {
    findFirst: async ({
      where,
    }: {
      where: { objectKey: string; profileId: string };
    }): Promise<{ mimeType: string; byteSize: number } | null> => {
      const hit = this.rows.find(
        (row) => row.objectKey === where.objectKey && row.profileId === where.profileId,
      );
      return hit ? { mimeType: hit.mimeType, byteSize: hit.byteSize } : null;
    },
  };
}

class FakeStorage {
  writes: { key: string; mime: string; size: number }[] = [];

  putObject = async (key: string, body: Buffer, mime: string) => {
    this.writes.push({ key, mime, size: body.byteLength });
  };
}

async function build() {
  const prisma = new FakePrisma();
  const storage = new FakeStorage();
  const module = await Test.createTestingModule({
    providers: [
      PhotoService,
      { provide: PrismaClient, useValue: prisma },
      { provide: StorageService, useValue: storage },
      // Unused by `uploadBytes`, but the service is constructed with it.
      { provide: ProfileService, useValue: {} },
    ],
  }).compile();

  return { service: module.get(PhotoService), prisma, storage };
}

describe('PhotoService.uploadBytes', () => {
  it('stores the bytes for the reservation the caller owns', async () => {
    const { service, storage } = await build();

    await service.uploadBytes('u1', 'profiles/p1/abc', Buffer.alloc(10, 1), 'image/jpeg');

    expect(storage.writes).toEqual([{ key: 'profiles/p1/abc', mime: 'image/jpeg', size: 10 }]);
  });

  it("404s for a key that is not the caller's reservation", async () => {
    const { service, storage } = await build();

    await expect(
      service.uploadBytes('u2', 'profiles/p1/abc', Buffer.alloc(10, 1), 'image/jpeg'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.writes).toHaveLength(0);
  });

  it('refuses a content type other than the one reserved', async () => {
    const { service, storage } = await build();

    await expect(
      service.uploadBytes('u1', 'profiles/p1/abc', Buffer.alloc(10, 1), 'image/png'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.writes).toHaveLength(0);
  });

  it('refuses bytes larger than the reservation', async () => {
    const { service, storage } = await build();

    await expect(
      service.uploadBytes('u1', 'profiles/p1/abc', Buffer.alloc(11, 1), 'image/jpeg'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.writes).toHaveLength(0);
  });

  it('refuses an empty body', async () => {
    const { service, storage } = await build();

    await expect(
      service.uploadBytes('u1', 'profiles/p1/abc', Buffer.alloc(0), 'image/jpeg'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.writes).toHaveLength(0);
  });
});
