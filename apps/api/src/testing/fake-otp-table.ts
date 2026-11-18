/**
 * An in-memory `otpRequest` table for tests that need the real `OtpService`.
 *
 * The service keeps its guarantees in the database: an attempt is counted with a
 * conditional increment, a code is claimed with a `status = PENDING` predicate,
 * and expiry is a bound rather than a read-then-write. A double that ignored the
 * predicates would let the service look correct while the guarantee was gone, so
 * this one applies them — equality on plain values, `lt`/`gt` bounds, and
 * `increment` patches.
 */

/** One stored code. Known columns are typed so tests can read them back. */
export interface FakeOtpRow {
  id: string;
  codeHash: string;
  mobile: string;
  purpose: string;
  email: string | null;
  status: string;
  attempts: number;
  maxAttempts: number;
  resendAfterAt: Date;
  expiresAt: Date;
  verifiedAt: Date | null;
  consumedAt: Date | null;
  requestDeviceId: string | null;
  /** Insertion order, so "newest first" is observable without a clock. */
  createdAt: number;
  [column: string]: unknown;
}

type Where = Record<string, unknown>;
type Patch = Record<string, unknown>;

export interface FakeOtpTable {
  rows: FakeOtpRow[];
  create(args: {
    data: Record<string, unknown>;
    select?: Record<string, boolean>;
  }): Promise<FakeOtpRow>;
  findFirst(args: {
    where: Where;
    orderBy?: { createdAt?: 'asc' | 'desc' };
  }): Promise<FakeOtpRow | null>;
  update(args: { where: { id: string }; data: Patch }): Promise<FakeOtpRow>;
  updateMany(args: { where: Where; data: Patch }): Promise<{ count: number }>;
}

const time = (value: unknown): number => (value instanceof Date ? value.getTime() : Number(value));

function matches(row: FakeOtpRow, where: Where): boolean {
  return Object.entries(where).every(([column, expected]) => {
    if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
      const bound = expected as { lt?: unknown; gt?: unknown };
      if ('lt' in bound) return time(row[column]) < time(bound.lt);
      if ('gt' in bound) return time(row[column]) > time(bound.gt);
      // Any other operator is not one the service uses; refusing it beats
      // pretending to understand it.
      return false;
    }
    return row[column] === expected;
  });
}

function apply(row: FakeOtpRow, data: Patch): void {
  for (const [column, value] of Object.entries(data)) {
    const change = value as { increment?: number } | null;
    row[column] =
      change !== null && typeof change === 'object' && 'increment' in change
        ? (row[column] as number) + (change.increment as number)
        : value;
  }
}

export function createFakeOtpTable(): FakeOtpTable {
  const rows: FakeOtpRow[] = [];
  let createdAt = 0;

  return {
    rows,
    create: async ({ data }) => {
      createdAt += 1;
      const row = {
        id: `otp_${createdAt}`,
        attempts: 0,
        verifiedAt: null,
        consumedAt: null,
        requestDeviceId: null,
        ...data,
        createdAt,
      } as FakeOtpRow;
      rows.push(row);
      return row;
    },
    findFirst: async ({ where }) => {
      const found = rows.filter((row) => matches(row, where));
      if (found.length === 0) return null;
      // Newest first, which is what the service asks for: a superseded code must
      // never be the one that matches.
      found.sort((a, b) => b.createdAt - a.createdAt);
      return found[0] ?? null;
    },
    update: async ({ where, data }) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error(`OTP request ${where.id} not found`);
      apply(row, data);
      return row;
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const row of rows) {
        if (matches(row, where)) {
          apply(row, data);
          count += 1;
        }
      }
      return { count };
    },
  };
}
