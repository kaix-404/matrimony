import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdminMasterDataService } from './master-data.admin.service';
import type { AuditService } from './audit.service';
import type { PrismaClient } from '../prisma/prisma-client';

/**
 * The master lists, edited from the console.
 *
 * The refusals matter more than the happy path: a sub-caste filed under a
 * religion that does not exist would be offered to nobody, and a label added
 * twice would make the same choice appear twice in a picker. Both are silent at
 * runtime, which is why they are tested here.
 */

const FLAT = { key: 'STATE', label: 'State' };

function setup() {
  const prisma = {
    masterList: { findUnique: jest.fn(), findMany: jest.fn() },
    masterListValue: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const audit = { record: jest.fn() };
  const service = new AdminMasterDataService(
    prisma as unknown as PrismaClient,
    audit as unknown as AuditService,
  );
  return { service, prisma, audit };
}

describe('createValue', () => {
  it('refuses a list that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.masterList.findUnique.mockResolvedValue(null);

    await expect(
      service.createValue('STATE', { value: 'Odisha' }, 'admin_1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a sub-caste whose religion is not on the list', async () => {
    const { service, prisma } = setup();
    prisma.masterList.findUnique.mockResolvedValue({ key: 'CASTE', label: 'Sub caste' });
    prisma.masterListValue.findMany.mockResolvedValue([
      { groupLabel: 'Hindu' },
      { groupLabel: 'Muslim - Sunni' },
    ]);

    await expect(
      service.createValue('CASTE', { value: 'Ad Dharmi', group: 'Buddhist' }, 'admin_1'),
    ).rejects.toThrow(/religion/);
    expect(prisma.masterListValue.create).not.toHaveBeenCalled();
  });

  it('refuses a value with no section in a list that has sections', async () => {
    const { service, prisma } = setup();
    prisma.masterList.findUnique.mockResolvedValue({ key: 'PROFESSION', label: 'Profession' });
    prisma.masterListValue.findMany.mockResolvedValue([{ groupLabel: 'IT & Software' }]);

    await expect(
      service.createValue('PROFESSION', { value: 'Designer' }, 'admin_1'),
    ).rejects.toThrow(/section/);
  });

  it('refuses a value a flat list is not allowed to section', async () => {
    const { service, prisma } = setup();
    prisma.masterList.findUnique.mockResolvedValue(FLAT);
    prisma.masterListValue.findMany.mockResolvedValue([]);

    await expect(
      service.createValue('STATE', { value: 'Odisha', group: 'East' }, 'admin_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('points at restore when the value exists but was retired', async () => {
    const { service, prisma } = setup();
    prisma.masterList.findUnique.mockResolvedValue(FLAT);
    prisma.masterListValue.findMany.mockResolvedValue([]);
    prisma.masterListValue.findFirst.mockResolvedValue({ id: 'value_1', isActive: false });

    await expect(service.createValue('STATE', { value: 'Odisha' }, 'admin_1')).rejects.toThrow(
      /retired/,
    );
    expect(prisma.masterListValue.create).not.toHaveBeenCalled();
  });

  it('refuses a second copy of a value already offered', async () => {
    const { service, prisma } = setup();
    prisma.masterList.findUnique.mockResolvedValue(FLAT);
    prisma.masterListValue.findMany.mockResolvedValue([]);
    prisma.masterListValue.findFirst.mockResolvedValue({ id: 'value_1', isActive: true });

    await expect(
      service.createValue('STATE', { value: 'odisha' }, 'admin_1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('appends the value after the last one and audits it', async () => {
    const { service, prisma, audit } = setup();
    prisma.masterList.findUnique.mockResolvedValue(FLAT);
    prisma.masterListValue.findMany.mockResolvedValue([]);
    prisma.masterListValue.findFirst.mockResolvedValue(null);
    prisma.masterListValue.aggregate.mockResolvedValue({ _max: { sortOrder: 35 } });
    prisma.masterListValue.create.mockResolvedValue({
      id: 'value_9',
      value: 'Odisha',
      groupLabel: '',
      isActive: true,
      sortOrder: 36,
    });

    const view = await service.createValue('STATE', { value: 'Odisha' }, 'admin_1');

    expect(prisma.masterListValue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { listKey: 'STATE', value: 'Odisha', groupLabel: '', sortOrder: 36 },
      }),
    );
    expect(view).toEqual({
      id: 'value_9',
      value: 'Odisha',
      group: null,
      is_active: true,
      sort_order: 36,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'master_data:value.create',
        actorAdminId: 'admin_1',
        resourceType: 'MasterListValue',
      }),
    );
  });

  it('files a typed section under the existing one however it was capitalised', async () => {
    const { service, prisma } = setup();
    prisma.masterList.findUnique.mockResolvedValue({ key: 'PROFESSION', label: 'Profession' });
    prisma.masterListValue.findMany.mockResolvedValue([{ groupLabel: 'IT & Software' }]);
    prisma.masterListValue.findFirst.mockResolvedValue(null);
    prisma.masterListValue.aggregate.mockResolvedValue({ _max: { sortOrder: 10 } });
    prisma.masterListValue.create.mockImplementation(
      ({ data }: { data: { value: string; groupLabel: string; sortOrder: number } }) => ({
        id: 'value_1',
        value: data.value,
        groupLabel: data.groupLabel,
        isActive: true,
        sortOrder: data.sortOrder,
      }),
    );

    await service.createValue(
      'PROFESSION',
      { value: 'Designer', group: 'it & software' },
      'admin_1',
    );

    expect(prisma.masterListValue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ groupLabel: 'IT & Software' }) }),
    );
  });
});

describe('updateValue', () => {
  const stored = {
    id: 'value_1',
    listKey: 'STATE',
    value: 'Orissa',
    groupLabel: '',
    isActive: true,
    sortOrder: 3,
  };

  it('refuses an id that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.masterListValue.findUnique.mockResolvedValue(null);

    await expect(
      service.updateValue('missing', { value: 'Odisha' }, 'admin_1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to rename onto a label already used in the same section', async () => {
    const { service, prisma } = setup();
    prisma.masterListValue.findUnique.mockResolvedValue(stored);
    prisma.masterListValue.findFirst.mockResolvedValue({ id: 'value_2' });

    await expect(service.updateValue('value_1', { value: 'Odisha' }, 'admin_1')).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.masterListValue.update).not.toHaveBeenCalled();
  });

  it('retires a value instead of deleting it, and records both states', async () => {
    const { service, prisma, audit } = setup();
    prisma.masterListValue.findUnique.mockResolvedValue(stored);
    prisma.masterListValue.update.mockResolvedValue({ ...stored, isActive: false });

    const view = await service.updateValue('value_1', { is_active: false }, 'admin_1');

    expect(prisma.masterListValue.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'value_1' }, data: { isActive: false } }),
    );
    expect(view.is_active).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'master_data:value.update',
        previousValue: expect.objectContaining({ value: 'Orissa', isActive: true }),
        newValue: expect.objectContaining({ value: 'Orissa', isActive: false }),
      }),
    );
  });

  it('renames a value without touching its section', async () => {
    const { service, prisma } = setup();
    prisma.masterListValue.findUnique.mockResolvedValue(stored);
    prisma.masterListValue.findFirst.mockResolvedValue(null);
    prisma.masterListValue.update.mockResolvedValue({ ...stored, value: 'Odisha' });

    const view = await service.updateValue('value_1', { value: 'Odisha' }, 'admin_1');

    expect(prisma.masterListValue.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { value: 'Odisha' } }),
    );
    expect(view.value).toBe('Odisha');
  });

  it('treats a resubmitted label as no change and writes no audit row', async () => {
    const { service, prisma, audit } = setup();
    prisma.masterListValue.findUnique.mockResolvedValue(stored);

    const view = await service.updateValue('value_1', { value: 'Orissa' }, 'admin_1');

    expect(view.value).toBe('Orissa');
    expect(prisma.masterListValue.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('listLists', () => {
  it('includes retired values, so they can be restored', async () => {
    const { service, prisma } = setup();
    prisma.masterList.findMany.mockResolvedValue([
      {
        key: 'STATE',
        label: 'State',
        isActive: true,
        values: [
          { id: 'v2', value: 'Odisha', groupLabel: '', isActive: true, sortOrder: 1 },
          { id: 'v1', value: 'Orissa', groupLabel: '', isActive: false, sortOrder: 2 },
        ],
      },
    ]);

    const response = await service.listLists();

    expect(response.lists).toHaveLength(1);
    expect(response.lists[0]?.values.map((row) => row.is_active)).toEqual([true, false]);
    expect(prisma.masterListValue.findMany).not.toHaveBeenCalled();
  });

  it('orders the lists the way the app does', async () => {
    const { service, prisma } = setup();
    prisma.masterList.findMany.mockResolvedValue([
      { key: 'STATE', label: 'State', isActive: true, values: [] },
      { key: 'RELIGION', label: 'Religion', isActive: true, values: [] },
    ]);

    const response = await service.listLists();

    expect(response.lists.map((list) => list.key)).toEqual(['RELIGION', 'STATE']);
  });
});
