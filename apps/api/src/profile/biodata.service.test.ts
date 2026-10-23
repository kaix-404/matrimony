import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { deflateSync } from 'node:zlib';
import { BiodataService } from './biodata.service';
import { StorageService } from '../storage/s3.service';
import { PrismaClient } from '../prisma/prisma-client';

/**
 * Doubles for the biodata flow.
 *
 * The service's correctness rests on three things a real S3 and Postgres would
 * obscure: which keys it refuses to read, what it does when storage throws, and
 * whether a master-list match is required before a value is proposed. Each has
 * a fake that makes the failure observable — `getObjectBytes` throws for a key
 * the test marks missing, and `masterListValue.findFirst` matches only what the
 * test seeds, so an unresolved `profession` cannot silently pass as fillable.
 */
type Row = Record<string, unknown>;

class FakePrisma {
  profileRow: Row | null = { id: 'p1' };
  masterValues: { listKey: string; value: string; id: string }[] = [];

  profile = {
    findUnique: async ({ where }: { where: { userId: string } }) =>
      where.userId === 'u1' ? this.profileRow : null,
  };

  masterListValue = {
    findFirst: async ({
      where,
    }: {
      where: { listKey: string; value: { equals: string; mode: string } };
    }) => {
      const hit = this.masterValues.find(
        (v) =>
          v.listKey === where.listKey &&
          v.value.toLowerCase() === where.value.equals.toLowerCase(),
      );
      return hit ? { id: hit.id, value: hit.value } : null;
    },
  };
}

class FakeStorage {
  objects = new Map<string, Buffer>();
  signCalls: { key: string; mime: string; size: number }[] = [];

  presignUpload = async (key: string, mime: string, size: number) => {
    this.signCalls.push({ key, mime, size });
    return `https://storage.test/${key}?sig=abc`;
  };

  getObjectBytes = async (key: string) => {
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error('NoSuchKey');
    return bytes;
  };
}

async function build() {
  const prisma = new FakePrisma();
  const storage = new FakeStorage();
  const module = await Test.createTestingModule({
    providers: [
      BiodataService,
      { provide: PrismaClient, useValue: prisma },
      { provide: StorageService, useValue: storage },
    ],
  }).compile();

  return { service: module.get(BiodataService), prisma, storage };
}

/** A minimal FlateDecode PDF whose content stream holds one `Tj` per line. */
function makePdf(lines: string[]): Buffer {
  const content = lines.map((l) => `(${l.replace(/([()\\])/g, '\\$1')}) Tj`).join('\n');
  const deflated = deflateSync(Buffer.from(content, 'latin1'));
  const header = Buffer.from('%PDF-1.4\n', 'latin1');
  const body = Buffer.concat([
    Buffer.from('\nstream\n', 'latin1'),
    deflated,
    Buffer.from('\nendstream\n', 'latin1'),
  ]);
  return Buffer.concat([header, body]);
}

describe('BiodataService.initiate', () => {
  it('namespaces the object under the caller profile and presigns the PUT', async () => {
    const { service, storage } = await build();

    const ticket = await service.initiate('u1', { mime_type: 'application/pdf', byte_size: 1024 });

    expect(ticket.object_key.startsWith('biodata/p1/')).toBe(true);
    expect(ticket.upload_url).toContain(ticket.object_key);
    expect(storage.signCalls[0]?.mime).toBe('application/pdf');
  });

  it('rejects an oversized document before reserving anything', async () => {
    const { service, storage } = await build();

    await expect(
      service.initiate('u1', { mime_type: 'application/pdf', byte_size: 11 * 1024 * 1024 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.signCalls).toHaveLength(0);
  });

  it('404s when the caller has no profile', async () => {
    const { service, prisma } = await build();
    prisma.profileRow = null;

    await expect(
      service.initiate('u1', { mime_type: 'application/pdf', byte_size: 1024 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('BiodataService.parse', () => {
  it('refuses a key outside the caller own prefix', async () => {
    const { service } = await build();

    await expect(service.parse('u1', 'biodata/p2/steal.pdf')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s when the object is not in storage', async () => {
    const { service } = await build();

    await expect(service.parse('u1', 'biodata/p1/missing.pdf')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('extracts fields from a text document', async () => {
    const { service, storage } = await build();
    storage.objects.set(
      'biodata/p1/doc.txt',
      Buffer.from('Name: Asha Rao\nGender: Female\nHeight: 5\'4"\nCity: Pune', 'utf8'),
    );

    const result = await service.parse('u1', 'biodata/p1/doc.txt');
    const byField = Object.fromEntries(result.values.map((v) => [v.field, v.value]));

    expect(byField.first_name).toBe('Asha Rao');
    expect(byField.gender).toBe('FEMALE');
    expect(byField.height_cm).toBe('163');
    expect(byField.city).toBe('Pune');
  });

  it('extracts fields from a FlateDecode PDF', async () => {
    const { service, storage } = await build();
    storage.objects.set(
      'biodata/p1/doc.pdf',
      makePdf(['Name: Asha Rao', 'Religion: Hindu', 'Education: B.E. Computer Science']),
    );

    const result = await service.parse('u1', 'biodata/p1/doc.pdf');
    const byField = Object.fromEntries(result.values.map((v) => [v.field, v.value]));

    expect(byField.first_name).toBe('Asha Rao');
    expect(byField.religion).toBe('Hindu');
  });

  it('warns and proposes nothing for a scan with no text layer', async () => {
    const { service, storage } = await build();
    // A PDF whose stream carries no text operators.
    storage.objects.set('biodata/p1/scan.pdf', makePdf([]));

    const result = await service.parse('u1', 'biodata/p1/scan.pdf');

    expect(result.values).toHaveLength(0);
    expect(result.warnings.join(' ')).toMatch(/no text|scan|type your details/i);
  });

  it('resolves a master-list label to its id and drops an unmatched one', async () => {
    const { service, storage, prisma } = await build();
    prisma.masterValues = [{ listKey: 'PROFESSION', value: 'Software Engineer', id: 'prof-1' }];
    storage.objects.set(
      'biodata/p1/doc.txt',
      Buffer.from('Profession: Software Engineer\nCommunity: Some Unlisted Caste', 'utf8'),
    );

    const result = await service.parse('u1', 'biodata/p1/doc.txt');
    const profession = result.values.find((v) => v.field === 'profession');
    const community = result.values.find((v) => v.field === 'community');

    expect(profession?.master_list_id).toBe('prof-1');
    // Unmatched: not proposed as fillable, listed as still-needed instead.
    expect(community).toBeUndefined();
    expect(result.unrecognised).toContain('community');
  });

  it('does not list a resolved field as unrecognised', async () => {
    const { service, storage } = await build();
    storage.objects.set('biodata/p1/doc.txt', Buffer.from('Name: Asha Rao', 'utf8'));

    const result = await service.parse('u1', 'biodata/p1/doc.txt');

    expect(result.unrecognised).not.toContain('first_name');
  });
});
