import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../prisma/prisma-client';
import {
  MASTER_LIST_KEYS,
  NET_WORTH_PENDING_REVIEW_KEY,
  GST_PERCENT,
  quotePayment,
  type MasterList,
  type MasterListsResponse,
  type NetWorthCategoryOption,
} from '@matrimony/shared';

/**
 * Admin-managed reference data — client decision D3.
 *
 * The client maintains education levels, professions, castes and communities
 * from the admin dashboard, so the API serves them rather than hardcoding them.
 * The alternative — a TypeScript union per list — would mean an app release to
 * add a single qualification, and would silently reject a value an admin had
 * legitimately added.
 *
 * Inactive values are omitted, not flagged. A retired value stays in the
 * database so historical rows keep resolving, but offering it in a picker would
 * let a user select something the business has withdrawn.
 */
@Injectable()
export class MasterDataService {
  constructor(private readonly prisma: PrismaClient) {}

  async lists(): Promise<MasterListsResponse> {
    const rows = await this.prisma.masterList.findMany({
      where: { isActive: true, key: { in: [...MASTER_LIST_KEYS] } },
      orderBy: { sortOrder: 'asc' },
      select: {
        key: true,
        label: true,
        isSensitive: true,
        values: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, value: true },
        },
      },
    });

    // Seeded in the order the client thinks of them; `sortOrder` is admin-set and
    // may be equal for freshly seeded lists, so the array order breaks the tie
    // and keeps the client from reshuffling on every fetch.
    const byKey = new Map(rows.map((row) => [row.key, row]));
    const ordered = MASTER_LIST_KEYS.flatMap((key) => {
      const row = byKey.get(key);
      return row ? [toContract(row)] : [];
    });

    return { lists: ordered };
  }

  /**
   * The net-worth bands, for the picker in registration and in the visibility
   * preference screen.
   *
   * Public for the same reason `lists` is: the app needs the bands before anyone
   * has a session, and a band is not user data.
   *
   * The review bucket is returned rather than filtered out. A client that fetched
   * only four bands could not tell "this option is unavailable" from "this option
   * does not exist", and the honest answer to a user whose net worth landed on a
   * boundary is that the band is awaiting review. The `is_discoverable` flag
   * carries that, and the preference contracts reject the bucket outright.
   */
  async netWorthCategories(): Promise<NetWorthCategoryOption[]> {
    const rows = await this.prisma.netWorthCategoryRef.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        key: true,
        label: true,
        description: true,
        minInr: true,
        maxInr: true,
        setupFeeAmount: true,
        isDiscoverable: true,
        sortOrder: true,
      },
    });

    // Ordered by sortOrder, which the admin owns, so the sequence they chose is
    // the one the client sees. Nothing else is assumed about band order.
    return rows.map((row) => {
      const setupFeeBase = row.setupFeeAmount.toFixed(2);

      return {
        key: row.key,
        label: row.label,
        description: row.description,
        // BigInt: rupee bounds past 2^53 would lose precision as a number, and
        // these are display strings, never arithmetic.
        min_inr: row.minInr === null ? null : row.minInr.toString(),
        max_inr: row.maxInr === null ? null : row.maxInr.toString(),
        setup_fee_amount: setupFeeBase,
        // The amount the user actually pays. Sending only the ₹15 base would
        // leave the client showing a total that is ₹2.70 short (GAP-5).
        setup_fee_total: quotePayment(setupFeeBase, GST_PERCENT).totalAmount,
        is_discoverable: row.isDiscoverable && row.key !== NET_WORTH_PENDING_REVIEW_KEY,
        sort_order: row.sortOrder,
      };
    });
  }

  /**
   * Resolves submitted master-list ids to labels.
   *
   * Called on every profile save. A submitted id is checked against its own list
   * and must be active, which is what stops a client from sending an id from a
   * different list (a caste id as a community), from one that has been retired,
   * or from one that simply does not exist.
   *
   * Returns the ids it accepted alongside the labels, so the caller can see
   * exactly which of the submitted values were resolved.
   */
  async resolveForProfile(input: {
    education_id?: string | null;
    profession_id?: string | null;
    community_id?: string | null;
  }): Promise<ResolvedMasterValues> {
    const out: ResolvedMasterValues = {};

    const fields: {
      field: keyof typeof input;
      listKey: string;
      assign: (id: string, label: string) => void;
    }[] = [
      {
        field: 'education_id',
        listKey: 'EDUCATION',
        assign: (id, label) => {
          out.educationId = id;
          out.educationValue = label;
        },
      },
      {
        field: 'profession_id',
        listKey: 'PROFESSION',
        assign: (id, label) => {
          out.professionId = id;
          out.professionValue = label;
        },
      },
      {
        field: 'community_id',
        listKey: 'COMMUNITY',
        assign: (id, label) => {
          out.communityId = id;
          out.communityValue = label;
        },
      },
    ];

    await Promise.all(
      fields.map(async ({ field, listKey, assign }) => {
        // `undefined` means "leave alone" and `null` means "clear"; only an
        // explicit id needs resolving.
        const id = input[field];
        if (id === undefined || id === null) return;

        const value = await this.prisma.masterListValue.findFirst({
          where: { id, listKey, isActive: true },
          select: { id: true, value: true },
        });

        if (!value) {
          // Unknown, retired, or belonging to another list. All three are the
          // client's mistake and are reported the same way.
          throw new BadMasterListValueError(field, id);
        }

        assign(value.id, value.value);
      }),
    );

    return out;
  }
}

/** Resolved labels are returned so a save response can echo what it stored. */
type ResolvedMasterValues = {
  educationId?: string;
  educationValue?: string;
  professionId?: string;
  professionValue?: string;
  communityId?: string;
  communityValue?: string;
};

function toContract(row: {
  key: string;
  label: string;
  isSensitive: boolean;
  values: { id: string; value: string }[];
}): MasterList {
  return {
    key: row.key,
    label: row.label,
    is_sensitive: row.isSensitive,
    values: row.values.map((v) => ({ id: v.id, value: v.value })),
  };
}

/**
 * A submitted master-list value that does not resolve.
 *
 * A distinct error type rather than a bare `BadRequestException`, so the profile
 * service can decide the status code and the controller can render a message
 * naming the field. A 400 naming the field is more useful than a 400 saying
 * "invalid request" — the app can point at the dropdown that is wrong.
 */
export class BadMasterListValueError extends Error {
  constructor(
    readonly field: string,
    readonly valueId: string,
  ) {
    super(`Unknown or inactive value for ${field}`);
    this.name = 'BadMasterListValueError';
  }
}
