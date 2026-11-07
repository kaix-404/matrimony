import Link from 'next/link';
import { DATA_REQUEST_STATUSES, type DataRequestStatus } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import type { AdminDataRequestList } from '@/lib/admin-types';
import {
  DATA_REQUEST_STATUS_LABELS,
  DATA_REQUEST_TYPE_LABELS,
  isOverdue,
} from '@/lib/data-requests';
import { describeError } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { readParam } from '@/lib/query';
import { Pager } from '../pager';
import { DataRequestStatusBadge } from './status-badge';

/**
 * The data-subject request queue (sections 21 and 32).
 *
 * These requests carry a statutory deadline, so the queue is ordered by `dueAt`
 * by the API rather than by arrival: the export that lapses tomorrow has to be at
 * the top whether it was filed last week or this morning. A lapsed deadline is
 * marked on the row, because it is the one thing on this page that is already
 * late rather than merely open.
 *
 * `force-dynamic` for the same reason as the moderation queue: another
 * administrator resolving a request must be visible on the next load, and the
 * overdue marks depend on the current time.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Data requests - Networth Matrimony Admin' };

function asStatus(value: string | undefined): DataRequestStatus | undefined {
  return value !== undefined && (DATA_REQUEST_STATUSES as readonly string[]).includes(value)
    ? (value as DataRequestStatus)
    : undefined;
}

export default async function DataRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = asStatus(readParam(params, 'status'));
  const cursor = readParam(params, 'cursor');

  const query = new URLSearchParams();
  if (status !== undefined) {
    query.set('status', status);
  }
  if (cursor !== undefined) {
    query.set('cursor', cursor);
  }
  const suffix = query.toString();

  let list: AdminDataRequestList | null = null;
  let error: string | null = null;
  try {
    list = await adminFetch<AdminDataRequestList>(
      suffix.length > 0 ? `/admin/data-requests?${suffix}` : '/admin/data-requests',
    );
  } catch (caught) {
    error = describeError(caught);
  }

  const now = new Date();
  const filters: Array<{ value: DataRequestStatus | null; label: string }> = [
    { value: null, label: 'All' },
    ...DATA_REQUEST_STATUSES.map((value) => ({
      value,
      label: DATA_REQUEST_STATUS_LABELS[value],
    })),
  ];

  return (
    <>
      <h1>Data requests</h1>
      <p className="lede">
        Access and erasure requests from members, soonest deadline first. Each one is owed an answer
        by the date shown; overdue rows are marked.
      </p>

      <div className="filters">
        {filters.map((filter) => {
          const active = filter.value === status || (filter.value === null && status === undefined);
          const href = filter.value === null ? '/data-requests' : `/data-requests?status=${filter.value}`;
          return (
            <Link key={filter.label} href={href} className={active ? 'chip active' : 'chip'}>
              {filter.label}
            </Link>
          );
        })}
      </div>

      {error !== null ? <div className="error">{error}</div> : null}

      {list !== null ? (
        <div className="card">
          {list.requests.length === 0 ? (
            <p className="notice">
              {status === undefined
                ? 'No member has asked for their data yet.'
                : 'No data request matches this filter.'}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Member</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th>Filed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.requests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <div>{DATA_REQUEST_TYPE_LABELS[request.type]}</div>
                      <div className="mono" style={{ color: 'var(--muted)' }}>
                        {request.id}
                      </div>
                    </td>
                    <td className="mono">{request.userId}</td>
                    <td>
                      <DataRequestStatusBadge status={request.status} />
                    </td>
                    <td>
                      <div>{formatDate(request.dueAt)}</div>
                      {isOverdue(request, now) ? (
                        <span className="badge badge-danger">Overdue</span>
                      ) : null}
                    </td>
                    <td>{formatDateTime(request.requestedAt)}</td>
                    <td>
                      <Link href={`/data-requests/${request.id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pager
            path="/data-requests"
            nextCursor={list.nextCursor}
            cursor={cursor}
            filters={{ status }}
          />
        </div>
      ) : null}
    </>
  );
}
