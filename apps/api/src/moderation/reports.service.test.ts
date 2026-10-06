import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReportReasonListResponseSchema, ReportSummarySchema } from '@matrimony/shared';
import { ReportsService } from './reports.service';

/**
 * Report intake tests.
 *
 * Section 20 is a one-way pipe into the admin dashboard, so almost all the risk
 * is in what the intake accepts rather than in what it returns. A reason the
 * app no longer offers, a target the caller was never shown, a complaint about
 * oneself, and an identical submission repeated fifty times are each a way for
 * the queue to become useless without any single request looking wrong.
 *
 * The fake reads the clauses the service sends instead of returning a fixed
 * shape, so a dropped `where.isActive` surfaces as a retired reason appearing
 * in the list rather than as a test that quietly keeps passing.
 */

const REPORTER = 'user_reporter';
const TARGET = 'user_target';
const PROFILE = 'profile_target';
const BAND = 'TWO_CR_TO_FIVE_CR';
const OTHER_BAND = 'FIVE_CR_TO_TEN_CR';

const REASON_PLAIN = 'reason_fake';
const REASON_NEEDS_TEXT = 'reason_harassment';
const REASON_RETIRED = 'reason_retired';

interface UserRow {
  id: string;
  networthCategory: string;
  deletedAt: Date | null;
  isAnonymised: boolean;
  status: string;
}

interface ProfileRow {
  id: string;
  userId: string;
  deletedAt: Date | null;
}

interface ReasonRow {
  id: string;
  code: string;
  label: string;
  description: string | null;
  isActive: boolean;
  requiresDescription: boolean;
  sortOrder: number;
}

interface ReportRow {
  id: string;
  reporterId: string;
  reportedProfileId: string | null;
  reportedUserId: string | null;
  reasonId: string;
  description: string | null;
  status: string;
  createdAt: Date;
}

function user(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: REPORTER,
    networthCategory: BAND,
    deletedAt: null,
    isAnonymised: false,
    status: 'ACTIVE',
    ...overrides,
  };
}

function targetUser(overrides: Partial<UserRow> = {}): UserRow {
  return user({ id: TARGET, ...overrides });
}

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return { id: PROFILE, userId: TARGET, deletedAt: null, ...overrides };
}

function reason(overrides: Partial<ReasonRow> = {}): ReasonRow {
  return {
    id: REASON_PLAIN,
    code: 'FAKE_PROFILE',
    label: 'Fake profile',
    description: null,
    isActive: true,
    requiresDescription: false,
    sortOrder: 1,
    ...overrides,
  };
}

function reasons(): ReasonRow[] {
  return [
    reason(),
    reason({
      id: REASON_NEEDS_TEXT,
      code: 'HARASSMENT',
      label: 'Harassment',
      description: 'Tell us what happened',
      requiresDescription: true,
      sortOrder: 5,
    }),
    reason({ id: REASON_RETIRED, code: 'OTHER', label: 'Other', isActive: false, sortOrder: 6 }),
  ];
}

interface ServiceFixture {
  service: ReportsService;
  users: UserRow[];
  profiles: ProfileRow[];
  reasons: ReasonRow[];
  reports: ReportRow[];
}

function makeService(opts: Partial<Omit<ServiceFixture, 'service'>> = {}): ServiceFixture {
  const users = opts.users ?? [user(), targetUser()];
  const profiles = opts.profiles ?? [profile()];
  const reasonsFixture = opts.reasons ?? reasons();
  const reports: ReportRow[] = opts.reports ?? [];

  const prisma = {
    reportReason: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const r = reasonsFixture.find((row) => row.id === where.id);
        if (!r) return null;
        return {
          id: r.id,
          code: r.code,
          isActive: r.isActive,
          requiresDescription: r.requiresDescription,
        };
      },
      findMany: async ({ where, orderBy }: { where: { isActive: boolean }; orderBy?: { sortOrder?: string } }) => {
        // Reads `where.isActive` rather than assuming it, so the service dropping
        // that filter would leak a retired reason into the app's reason list.
        const rows = reasonsFixture.filter((row) => row.isActive === where.isActive);

        const ordered = [...rows];
        if (orderBy?.sortOrder === 'asc') ordered.sort((a, b) => a.sortOrder - b.sortOrder);
        if (orderBy?.sortOrder === 'desc') ordered.sort((a, b) => b.sortOrder - a.sortOrder);

        return ordered.map((row) => ({
          id: row.id,
          code: row.code,
          label: row.label,
          description: row.description,
          requiresDescription: row.requiresDescription,
        }));
      },
    },
    profile: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const p = profiles.find((row) => row.id === where.id);
        if (!p) return null;

        const owner = users.find((u) => u.id === p.userId);
        if (!owner) return null;

        return {
          id: p.id,
          userId: p.userId,
          deletedAt: p.deletedAt,
          user: {
            networthCategory: owner.networthCategory,
            deletedAt: owner.deletedAt,
            isAnonymised: owner.isAnonymised,
            status: owner.status,
          },
        };
      },
    },
    user: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const u = users.find((row) => row.id === where.id);
        if (!u) throw new Error('record not found');
        return { networthCategory: u.networthCategory };
      },
    },
    report: {
      findFirst: async ({ where }: { where: ReportRow | { reporterId: string } }) => {
        const matches = reports.filter(
          (row) =>
            row.reporterId === where.reporterId &&
            ('reportedProfileId' in where ? row.reportedProfileId === where.reportedProfileId : false) &&
            ('reasonId' in where ? row.reasonId === where.reasonId : false) &&
            ('status' in where ? row.status === where.status : false),
        );
        if (!matches.length) return null;

        const [first] = [...matches].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return { id: first.id, status: first.status, createdAt: first.createdAt };
      },
      create: async ({ data }: { data: Omit<ReportRow, 'id' | 'createdAt'> & { createdAt?: Date } }) => {
        // The service does not send `status`; the column defaults to OPEN. A fake
        // that left it undefined would report `status: undefined` and make the
        // open-dedupe query below match nothing, so the test would assert against
        // a state the database can never produce.
        const row: ReportRow = {
          id: `report_${reports.length + 1}`,
          status: 'OPEN',
          createdAt: data.createdAt ?? new Date('2026-10-06T12:00:00.000Z'),
          ...data,
        };
        reports.push(row);
        return { id: row.id, status: row.status, createdAt: row.createdAt };
      },
    },
  };

  return { service: new ReportsService(prisma as never), users, profiles, reasons: reasonsFixture, reports };
}

describe('ReportsService.reasons', () => {
  it('lists only active reasons, in the order the form should render them', async () => {
    const { service } = makeService();

    const result = await service.reasons();

    // A retired reason appearing here would be a reason the app offers that the
    // dashboard can no longer filter on, because intake would reject it with 404.
    expect(result.items.map((r) => r.reason_id)).toEqual([REASON_PLAIN, REASON_NEEDS_TEXT]);
    ReportReasonListResponseSchema.parse(result);
  });

  it('tells the app which reasons must collect free text', async () => {
    const { service } = makeService();

    const result = await service.reasons();

    expect(result.items.find((r) => r.reason_id === REASON_NEEDS_TEXT)).toMatchObject({
      code: 'HARASSMENT',
      description: 'Tell us what happened',
      requires_description: true,
    });
    expect(result.items.find((r) => r.reason_id === REASON_PLAIN)?.requires_description).toBe(false);
  });
});

describe('ReportsService.create', () => {
  it('files a report and answers with a schema-valid summary', async () => {
    const { service, reports } = makeService();

    const result = await service.create(REPORTER, { reason_id: REASON_PLAIN, profile_id: PROFILE });

    ReportSummarySchema.parse(result);
    expect(result).toMatchObject({
      profile_id: PROFILE,
      reason_code: 'FAKE_PROFILE',
      status: 'OPEN',
      created_at: '2026-10-06T12:00:00.000Z',
    });

    expect(reports).toHaveLength(1);
    // Both pointers, not just the profile: section 21 can soft-delete the
    // profile underneath the report, and the complaint must still name the
    // account it was about.
    expect(reports[0]).toMatchObject({
      reporterId: REPORTER,
      reportedProfileId: PROFILE,
      reportedUserId: TARGET,
      reasonId: REASON_PLAIN,
      description: null,
      status: 'OPEN',
    });
  });

  it('records the free text when the reason asks for it', async () => {
    const { service, reports } = makeService();

    await service.create(REPORTER, {
      reason_id: REASON_NEEDS_TEXT,
      profile_id: PROFILE,
      description: '  sent unsolicited contact details  ',
    });

    expect(reports[0].description).toBe('sent unsolicited contact details');
  });

  it('rejects a reason that requires a description but was given none', async () => {
    const { service, reports } = makeService();

    await expect(
      service.create(REPORTER, { reason_id: REASON_NEEDS_TEXT, profile_id: PROFILE }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(reports).toHaveLength(0);
  });

  it('treats whitespace-only text as absent', async () => {
    const { service, reports } = makeService();

    // The check decides whether the report is accepted, so it cannot depend on
    // a transport pipe having trimmed the input first.
    await expect(
      service.create(REPORTER, {
        reason_id: REASON_NEEDS_TEXT,
        profile_id: PROFILE,
        description: '   \n  ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(reports).toHaveLength(0);
  });

  it('answers 404 for a reason that never existed', async () => {
    const { service, reports } = makeService();

    await expect(
      service.create(REPORTER, { reason_id: 'reason_missing', profile_id: PROFILE }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(reports).toHaveLength(0);
  });

  it('answers 404 for a reason admin has retired', async () => {
    const { service, reports } = makeService();

    await expect(
      service.create(REPORTER, { reason_id: REASON_RETIRED, profile_id: PROFILE }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(reports).toHaveLength(0);
  });

  it('answers 404 for a profile in another net-worth band', async () => {
    const { service, reports } = makeService({
      users: [user(), targetUser({ networthCategory: OTHER_BAND })],
    });

    // 404 rather than 403: a distinction here would confirm that an id from the
    // other band is real, which is the oracle section 12 exists to close.
    await expect(service.create(REPORTER, { reason_id: REASON_PLAIN, profile_id: PROFILE })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(reports).toHaveLength(0);
  });

  it('answers 404 for a deleted profile', async () => {
    const { service, reports } = makeService({ profiles: [profile({ deletedAt: new Date() })] });

    await expect(service.create(REPORTER, { reason_id: REASON_PLAIN, profile_id: PROFILE })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(reports).toHaveLength(0);
  });

  it('answers 404 for a profile that does not exist', async () => {
    const { service, reports } = makeService({ profiles: [] });

    await expect(service.create(REPORTER, { reason_id: REASON_PLAIN, profile_id: 'nope' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(reports).toHaveLength(0);
  });

  it('refuses to report your own profile', async () => {
    const { service, reports } = makeService({
      profiles: [profile({ userId: REPORTER })],
    });

    await expect(service.create(REPORTER, { reason_id: REASON_PLAIN, profile_id: PROFILE })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(reports).toHaveLength(0);
  });

  it('does not append a second copy of a complaint that is still open', async () => {
    const { service, reports } = makeService();

    const first = await service.create(REPORTER, { reason_id: REASON_PLAIN, profile_id: PROFILE });
    const second = await service.create(REPORTER, { reason_id: REASON_PLAIN, profile_id: PROFILE });

    // One tap too many is not two complaints. The queue is a spam surface, and
    // nothing stops a client that retried from submitting again.
    expect(reports).toHaveLength(1);
    expect(second.report_id).toBe(first.report_id);
    ReportSummarySchema.parse(second);
  });

  it('files again once the earlier complaint has been resolved', async () => {
    const { service, reports } = makeService({
      reports: [
        {
          id: 'report_old',
          reporterId: REPORTER,
          reportedProfileId: PROFILE,
          reportedUserId: TARGET,
          reasonId: REASON_PLAIN,
          description: null,
          status: 'DISMISSED',
          createdAt: new Date('2026-09-01T12:00:00.000Z'),
        },
      ],
    });

    const result = await service.create(REPORTER, { reason_id: REASON_PLAIN, profile_id: PROFILE });

    // A dismissed report is one that was considered. Conduct that continued
    // afterwards is a new incident, not a duplicate of the old one.
    expect(reports).toHaveLength(2);
    expect(result.report_id).not.toBe('report_old');
  });

  it('keeps complaints about the same profile under different reasons apart', async () => {
    const { service, reports } = makeService();

    await service.create(REPORTER, { reason_id: REASON_PLAIN, profile_id: PROFILE });
    await service.create(REPORTER, { reason_id: REASON_NEEDS_TEXT, profile_id: PROFILE, description: 'detail' });

    expect(reports).toHaveLength(2);
    expect(reports.map((r) => r.reasonId)).toEqual([REASON_PLAIN, REASON_NEEDS_TEXT]);
  });
});
