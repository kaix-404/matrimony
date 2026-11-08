import { DataRequestSchema, DataRequestListResponseSchema } from '@matrimony/shared';
import { FrozenClock } from '../common/clock/clock.service';
import { DataRequestsService } from './data-requests.service';

/**
 * Member-filed data requests.
 *
 * Before this existed the admin queue read a table no product code wrote to, so
 * the interesting risks are about the row that gets written: the deadline it
 * carries, whether a second tap files a second request, and whether the read path
 * can be made to return somebody else's requests.
 *
 * Responses are validated against the shared schema, for the reason
 * `blocks.service.test.ts` gives: a hand-written expectation would accept a
 * camelCase field the app cannot render.
 */

const USER = 'user_member';

interface DataRequestRow {
  id: string;
  userId: string;
  type: string;
  status: string;
  requestedAt: Date;
  dueAt: Date;
  completedAt: Date | null;
  resolutionNotes: string | null;
}

/** The `where` clause `dataRequest.findFirst` / `findMany` receives. */
interface RequestWhere {
  userId?: string;
  type?: string;
  status?: { in?: string[] };
}

function row(overrides: Partial<DataRequestRow> = {}): DataRequestRow {
  return {
    id: 'dr_1',
    userId: USER,
    type: 'EXPORT',
    status: 'REQUESTED',
    requestedAt: new Date('2026-01-01T00:00:00.000Z'),
    dueAt: new Date('2026-01-31T00:00:00.000Z'),
    completedAt: null,
    resolutionNotes: null,
    ...overrides,
  };
}

function makeService(rows: DataRequestRow[]) {
  const creates: unknown[] = [];
  const findFirstWheres: RequestWhere[] = [];
  const findManyWheres: RequestWhere[] = [];

  const prisma = {
    dataRequest: {
      findFirst: ({ where }: { where: RequestWhere }) => {
        findFirstWheres.push(where);
        return Promise.resolve(
          rows.find(
            (r) =>
              r.userId === where.userId &&
              r.type === where.type &&
              (where.status?.in ?? [r.status]).includes(r.status),
          ) ?? null,
        );
      },
      findMany: ({ where, orderBy }: { where: RequestWhere; orderBy: unknown[] }) => {
        findManyWheres.push(where);
        expect(orderBy).toEqual([{ requestedAt: 'desc' }, { id: 'desc' }]);
        return Promise.resolve(rows.filter((r) => r.userId === where.userId));
      },
      create: ({ data }: { data: DataRequestRow }) => {
        creates.push(data);
        const created = row(data);
        rows.push(created);
        return Promise.resolve(created);
      },
    },
  };

  const clock = new FrozenClock(new Date('2026-03-01T12:00:00.000Z'));
  const service = new DataRequestsService(
    prisma as unknown as ConstructorParameters<typeof DataRequestsService>[0],
    clock,
  );

  return { service, creates, findFirstWheres, findManyWheres };
}

describe('DataRequestsService.create', () => {
  it('files an export with a thirty-day deadline, from server time', async () => {
    const { service, creates } = makeService([]);

    const request = DataRequestSchema.parse(await service.create(USER, { type: 'EXPORT' }));

    expect(creates).toEqual([
      {
        userId: USER,
        type: 'EXPORT',
        status: 'REQUESTED',
        requestedAt: new Date('2026-03-01T12:00:00.000Z'),
        dueAt: new Date('2026-03-31T12:00:00.000Z'),
      },
    ]);
    expect(request.status).toBe('REQUESTED');
    expect(request.due_at).toBe('2026-03-31T12:00:00.000Z');
    expect(request.completed_at).toBeNull();
    expect(request.resolution_notes).toBeNull();
  });

  it('returns the request already waiting instead of filing a second', async () => {
    const open = row({ id: 'dr_open', status: 'IN_PROGRESS' });
    const { service, creates, findFirstWheres } = makeService([open]);

    const request = DataRequestSchema.parse(await service.create(USER, { type: 'EXPORT' }));

    expect(request.id).toBe('dr_open');
    expect(creates).toEqual([]);
    // Only requests still awaiting an answer count as open.
    expect(findFirstWheres[0]?.status?.in).toEqual(['REQUESTED', 'IN_PROGRESS']);
  });

  it('files a new request when the previous one was answered', async () => {
    const { service, creates } = makeService([row({ id: 'dr_done', status: 'COMPLETED' })]);

    const request = DataRequestSchema.parse(await service.create(USER, { type: 'EXPORT' }));

    expect(request.id).toBe('dr_1');
    expect(creates).toHaveLength(1);
  });
});

describe('DataRequestsService.list', () => {
  it("returns only the caller's requests, newest first", async () => {
    const { service, findManyWheres } = makeService([
      row({ id: 'dr_mine', userId: USER }),
      row({ id: 'dr_someone_else', userId: 'user_other' }),
    ]);

    const list = DataRequestListResponseSchema.parse(await service.list(USER));

    expect(list.requests.map((r) => r.id)).toEqual(['dr_mine']);
    expect(findManyWheres).toEqual([{ userId: USER }]);
  });

  it('carries the resolution notes of an answered request', async () => {
    const { service } = makeService([
      row({
        id: 'dr_refused',
        status: 'REJECTED',
        completedAt: new Date('2026-01-05T00:00:00.000Z'),
        resolutionNotes: 'Account is already anonymised',
      }),
    ]);

    const list = DataRequestListResponseSchema.parse(await service.list(USER));

    expect(list.requests[0]).toMatchObject({
      status: 'REJECTED',
      completed_at: '2026-01-05T00:00:00.000Z',
      resolution_notes: 'Account is already anonymised',
    });
  });

  it('returns an empty list for a member who never asked', async () => {
    const { service } = makeService([]);

    await expect(service.list(USER)).resolves.toEqual({ requests: [] });
  });
});
