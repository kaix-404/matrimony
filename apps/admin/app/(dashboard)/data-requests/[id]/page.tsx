import Link from 'next/link';
import type { AdminDataRequestView } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import {
  DATA_REQUEST_STATUS_LABELS,
  DATA_REQUEST_TYPE_DESCRIPTIONS,
  DATA_REQUEST_TYPE_LABELS,
  isOverdue,
  isTerminalDataRequestStatus,
} from '@/lib/data-requests';
import { describeError } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { DataRequestStatusBadge } from '../status-badge';
import { ResolveForm } from './resolve-form';

/**
 * One data-subject request (sections 21 and 32).
 *
 * The page exists so a decision is made with the deadline, the member and the
 * reason in view, and so the resolution notes are stored with the request rather
 * than in someone's sent mail. A resolved request shows what was decided instead
 * of the form: the API refuses a second resolution, and offering the form anyway
 * would invite an administrator to try.
 */
export const dynamic = 'force-dynamic';

export default async function DataRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { resolved } = await searchParams;

  let request: AdminDataRequestView | null = null;
  let error: string | null = null;
  try {
    request = await adminFetch<AdminDataRequestView>(`/admin/data-requests/${id}`);
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <p>
        <Link href="/data-requests">&larr; Back to the queue</Link>
      </p>

      {error !== null ? <div className="error">{error}</div> : null}

      {request !== null ? (
        <>
          <h1>
            {DATA_REQUEST_TYPE_LABELS[request.type]}{' '}
            <span className="mono">{request.id}</span>
          </h1>
          <p className="lede">
            <DataRequestStatusBadge status={request.status} /> - filed{' '}
            {formatDateTime(request.requestedAt)}
          </p>

          {resolved === '1' ? (
            <div className="card">
              <p className="notice">The request was resolved.</p>
            </div>
          ) : null}

          <div className="card">
            <h2>What was asked for</h2>
            <p className="notice">{DATA_REQUEST_TYPE_DESCRIPTIONS[request.type]}</p>
            <dl className="meta">
              <dt>Member</dt>
              <dd className="mono">{request.userId}</dd>
              <dt>Due</dt>
              <dd>
                {formatDate(request.dueAt)}
                {isOverdue(request, new Date()) ? (
                  <>
                    {' '}
                    <span className="badge badge-danger">Overdue</span>
                  </>
                ) : null}
              </dd>
              <dt>Status</dt>
              <dd>{DATA_REQUEST_STATUS_LABELS[request.status]}</dd>
            </dl>
          </div>

          {isTerminalDataRequestStatus(request.status) ? (
            <div className="card">
              <h2>Resolution</h2>
              <dl className="meta">
                <dt>Outcome</dt>
                <dd>{DATA_REQUEST_STATUS_LABELS[request.status]}</dd>
                <dt>Notes</dt>
                <dd>{request.resolutionNotes ?? '-'}</dd>
                <dt>Resolved</dt>
                <dd>{formatDateTime(request.completedAt)}</dd>
                <dt>By</dt>
                <dd className="mono">{request.handledByAdminId ?? '-'}</dd>
              </dl>
            </div>
          ) : (
            <div className="card">
              <h2>Resolve this request</h2>
              <ResolveForm requestId={request.id} />
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
