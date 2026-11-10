import { Injectable } from '@nestjs/common';
import type {
  CreateDataRequestInput,
  DataRequest,
  DataRequestListResponse,
} from '@matrimony/shared';
import { ClockService } from '../common/clock/clock.service';
import { PrismaClient, DataRequestStatus, DataRequestType } from '../prisma/prisma-client';
import type { Prisma } from '../prisma/prisma-client';

/**
 * How long a member waits for an answer, in days.
 *
 * The statutory window for a data-subject request. It is stored on the row as
 * `dueAt` rather than recomputed at read time so that the queue keeps sorting by
 * the deadline that was promised when the request was filed, even if the policy
 * later changes.
 */
const RESPONSE_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The statuses in which a request is still waiting for an administrator. */
const OPEN_STATUSES: DataRequestStatus[] = [
  DataRequestStatus.REQUESTED,
  DataRequestStatus.IN_PROGRESS,
];

const DATA_REQUEST_SELECT = {
  id: true,
  type: true,
  status: true,
  requestedAt: true,
  dueAt: true,
  completedAt: true,
  resolutionNotes: true,
} as const satisfies Prisma.DataRequestSelect;

interface DataRequestRow {
  id: string;
  type: string;
  status: string;
  requestedAt: Date;
  dueAt: Date;
  completedAt: Date | null;
  resolutionNotes: string | null;
}

function toView(row: DataRequestRow): DataRequest {
  return {
    id: row.id,
    type: row.type as DataRequest['type'],
    status: row.status as DataRequest['status'],
    requested_at: row.requestedAt.toISOString(),
    due_at: row.dueAt.toISOString(),
    completed_at: row.completedAt ? row.completedAt.toISOString() : null,
    resolution_notes: row.resolutionNotes,
  };
}

/**
 * Section 21 — a member asking for a copy of their own data.
 *
 * The admin queue reads `DataRequest` rows and can resolve them; until this
 * service existed nothing in the product could create one, so the queue was only
 * ever as real as whatever an operator inserted by hand.
 *
 * The request is deliberately just a row: nothing here assembles an export
 * archive. Producing one is an administrative act (an administrator assembles it,
 * records the artefact key and marks the request complete), and a member-facing
 * endpoint that streamed a full account dump would be a far larger disclosure
 * surface than a queue entry that a human answers.
 */
@Injectable()
export class DataRequestsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: ClockService,
  ) {}

  /**
   * Files an export request.
   *
   * Idempotent while one is open: asking again returns the request already
   * waiting rather than filing a second. A member who taps twice, or whose
   * connection dropped after the row was written, ends up with the same one
   * request they meant to file — not an error screen, and not two queue entries
   * for an administrator to answer twice.
   *
   * A *resolved* request does not block a new one; wanting a fresh copy a year
   * later is a new request, not a duplicate.
   */
  async create(userId: string, input: CreateDataRequestInput): Promise<DataRequest> {
    const type = DataRequestType[input.type];

    const open = await this.prisma.dataRequest.findFirst({
      where: { userId, type, status: { in: OPEN_STATUSES } },
      select: DATA_REQUEST_SELECT,
    });

    if (open) return toView(open);

    const requestedAt = this.clock.now();
    const created = await this.prisma.dataRequest.create({
      data: {
        userId,
        type,
        status: DataRequestStatus.REQUESTED,
        requestedAt,
        dueAt: new Date(requestedAt.getTime() + RESPONSE_WINDOW_DAYS * DAY_MS),
      },
      select: DATA_REQUEST_SELECT,
    });

    return toView(created);
  }

  /**
   * The caller's own requests, newest first.
   *
   * Scoped by the token subject and nothing else, for the reason the blocked list
   * gives: `data requests` are per-account data, so a route that accepted whose
   * requests to list could only ever be a way to ask about somebody else.
   */
  async list(userId: string): Promise<DataRequestListResponse> {
    const rows = await this.prisma.dataRequest.findMany({
      where: { userId },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      select: DATA_REQUEST_SELECT,
    });

    return { requests: rows.map(toView) };
  }
}
