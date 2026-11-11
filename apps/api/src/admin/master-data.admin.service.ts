import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MASTER_LIST_KEYS,
  type AdminCreateMasterListValueInput,
  type AdminMasterListsResponse,
  type AdminMasterListView,
  type AdminMasterListValueView,
  type AdminUpdateMasterListValueInput,
  type MasterListKey,
} from '@matrimony/shared';
import { Prisma, PrismaClient } from '../prisma/prisma-client';
import { AuditService } from './audit.service';

/**
 * The master lists, from the console — client decision D3.
 *
 * Members pick education, occupation, sub-caste, mother tongue, religion, state
 * and community from these lists, and `MasterDataService` serves the active
 * values to the app. This service is the other half: the part that adds,
 * renames and retires a value, which until now had no path outside a redeploy of
 * the seed.
 *
 * Three rules shape everything here:
 *
 *   1. Nothing is ever deleted. A profile references a value by id (and a
 *      sub-caste by text), so a delete would either fail on the foreign key or
 *      erase a label a member's profile still needs. Retiring keeps the row for
 *      history and drops it from the pickers.
 *   2. A list's structure is its data. Whether a list has sections, and which
 *      sections it has, is read from the values already stored — not from a
 *      table of list metadata — so a value can never land in a section that does
 *      not exist.
 *   3. Every change is audited with the value before and after. Renaming a state
 *      or retiring a caste changes what every member sees, and the audit log is
 *      the only place that can explain a picker looking different tomorrow.
 */

const VALUE_SELECT = {
  id: true,
  // `updateValue` audits the list a value belongs to, so it is selected here
  // rather than re-read from the row it just fetched.
  listKey: true,
  value: true,
  groupLabel: true,
  isActive: true,
  sortOrder: true,
} satisfies Prisma.MasterListValueSelect;

type ValueRow = {
  id: string;
  value: string;
  groupLabel: string;
  isActive: boolean;
  sortOrder: number;
};

/**
 * The one list whose sections are not free text.
 *
 * Every other grouped list (education, occupation) may gain a section when the
 * business enters a new degree family or industry. A sub-caste, though, belongs
 * to a religion that already exists: inventing a section here would silently
 * create a religion no member can choose and that `Profile.subCaste` would then
 * reject on save.
 */
const RELIGION_SCOPED_LIST: MasterListKey = 'CASTE';

@Injectable()
export class AdminMasterDataService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  /**
   * Every list with every value, retired ones included.
   *
   * The member-facing endpoint omits inactive values; this one must not, or a
   * value retired by mistake would be invisible and unrestorable.
   */
  async listLists(): Promise<AdminMasterListsResponse> {
    const rows = await this.prisma.masterList.findMany({
      where: { key: { in: [...MASTER_LIST_KEYS] } },
      select: {
        key: true,
        label: true,
        isActive: true,
        values: {
          orderBy: [{ groupLabel: 'asc' }, { sortOrder: 'asc' }, { value: 'asc' }],
          select: VALUE_SELECT,
        },
      },
    });

    // The client's own order, so the console lists the same sequence the app does.
    const byKey = new Map(rows.map((row) => [row.key, row]));
    const lists: AdminMasterListView[] = MASTER_LIST_KEYS.flatMap((key) => {
      const row = byKey.get(key);
      if (row === undefined) return [];
      return [
        {
          key: row.key as MasterListKey,
          label: row.label,
          is_active: row.isActive,
          values: row.values.map(toView),
        },
      ];
    });

    return { lists };
  }

  /** Adds one value to a list, in the section it belongs to. */
  async createValue(
    key: MasterListKey,
    input: AdminCreateMasterListValueInput,
    actingAdminId: string,
  ): Promise<AdminMasterListValueView> {
    const list = await this.prisma.masterList.findUnique({
      where: { key },
      select: { key: true, label: true },
    });
    if (list === null) {
      throw new NotFoundException(`Unknown master list: ${key}`);
    }

    const group = await this.resolveSection(key, input.group);

    // Case-insensitive: "Odisha" and "odisha" are the same choice to a member even
    // though the unique index would let both in.
    const existing = await this.prisma.masterListValue.findFirst({
      where: {
        listKey: key,
        groupLabel: group,
        value: { equals: input.value, mode: 'insensitive' },
      },
      select: { id: true, isActive: true },
    });
    if (existing !== null) {
      throw new ConflictException(
        existing.isActive
          ? `"${input.value}" is already in ${list.label}${sectionSuffix(group)}.`
          : `"${input.value}" was retired from ${list.label}${sectionSuffix(group)}; restore it instead of adding it again.`,
      );
    }

    // Appended, so a value added today appears where the client would expect it
    // rather than at the top of a list they carefully ordered.
    const last = await this.prisma.masterListValue.aggregate({
      where: { listKey: key },
      _max: { sortOrder: true },
    });
    const sortOrder = (last._max.sortOrder ?? 0) + 1;

    const created = await this.prisma.masterListValue.create({
      data: { listKey: key, value: input.value, groupLabel: group, sortOrder },
      select: VALUE_SELECT,
    });

    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'master_data:value.create',
      resourceType: 'MasterListValue',
      resourceId: created.id,
      newValue: { list: key, value: created.value, group: created.groupLabel, isActive: true },
    });

    return toView(created);
  }

  /**
   * Renames a value, or retires/restores it.
   *
   * Renaming is the fix for a client spelling ("Orissa" to "Odisha") because
   * every profile pointing at the row resolves the new label immediately. It is
   * also the riskier operation of the two, so a rename that would collide with
   * another value in the same section is refused rather than merged.
   */
  async updateValue(
    id: string,
    input: AdminUpdateMasterListValueInput,
    actingAdminId: string,
  ): Promise<AdminMasterListValueView> {
    const current = await this.prisma.masterListValue.findUnique({
      where: { id },
      select: VALUE_SELECT,
    });
    if (current === null) {
      throw new NotFoundException(`Unknown master list value: ${id}`);
    }

    const nextValue = input.value ?? current.value;
    const nextActive = input.is_active ?? current.isActive;

    // A form that resubmits what is already stored is not an error, but it is
    // not a change either: auditing it would fill the log with non-events.
    if (nextValue === current.value && nextActive === current.isActive) {
      return toView(current);
    }

    if (nextValue !== current.value) {
      const collision = await this.prisma.masterListValue.findFirst({
        where: {
          listKey: current.listKey,
          groupLabel: current.groupLabel,
          value: { equals: nextValue, mode: 'insensitive' },
          NOT: { id: current.id },
        },
        select: { id: true },
      });
      if (collision !== null) {
        throw new ConflictException(
          `"${nextValue}" is already in this list${sectionSuffix(current.groupLabel)}.`,
        );
      }
    }

    const updated = await this.prisma.masterListValue.update({
      where: { id },
      data: {
        ...(nextValue === current.value ? {} : { value: nextValue }),
        ...(nextActive === current.isActive ? {} : { isActive: nextActive }),
      },
      select: VALUE_SELECT,
    });

    await this.audit.record({
      actorAdminId: actingAdminId,
      action: 'master_data:value.update',
      resourceType: 'MasterListValue',
      resourceId: updated.id,
      previousValue: {
        list: current.listKey,
        value: current.value,
        isActive: current.isActive,
      },
      newValue: { list: current.listKey, value: updated.value, isActive: updated.isActive },
    });

    return toView(updated);
  }

  /**
   * The section a new value belongs to, or `''` for a flat list.
   *
   * A section typed with different capitalisation from the existing one is
   * matched to it: "It & Software" must not become a second section beside
   * "IT & Software", because the picker would then show the same industry twice.
   */
  private async resolveSection(key: MasterListKey, requested?: string): Promise<string> {
    const rows = await this.prisma.masterListValue.findMany({
      where: { listKey: key, groupLabel: { not: '' } },
      select: { groupLabel: true },
      distinct: ['groupLabel'],
      orderBy: { groupLabel: 'asc' },
    });
    const sections = rows.map((row) => row.groupLabel);

    if (sections.length === 0) {
      if (requested !== undefined) {
        throw new BadRequestException('This list has no sections, so a value cannot be given one.');
      }
      return '';
    }

    if (requested === undefined) {
      throw new BadRequestException(
        key === RELIGION_SCOPED_LIST
          ? 'Choose the religion this sub-caste belongs to.'
          : 'Choose the section this value belongs to.',
      );
    }

    const existing = sections.find((section) => section.toLowerCase() === requested.toLowerCase());
    if (existing !== undefined) return existing;

    if (key === RELIGION_SCOPED_LIST) {
      throw new BadRequestException(
        `Sub-castes are grouped by religion, and "${requested}" is not one of them.`,
      );
    }

    return requested;
  }
}

function sectionSuffix(group: string): string {
  return group === '' ? '' : ` under ${group}`;
}

function toView(row: ValueRow): AdminMasterListValueView {
  return {
    id: row.id,
    value: row.value,
    // The member contract turns an empty section into null so a flat list does
    // not render a blank heading; this mirrors it.
    group: row.groupLabel === '' ? null : row.groupLabel,
    is_active: row.isActive,
    sort_order: row.sortOrder,
  };
}
