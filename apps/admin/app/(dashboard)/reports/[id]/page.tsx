import Link from 'next/link';
import type { AdminReportView } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { REPORT_ACTION_LABELS, REPORT_STATUS_LABELS, isTerminalReportStatus } from '@/lib/reports';
import { StatusBadge } from '../status-badge';
import { ReviewForm } from './review-form';

export const dynamic = 'force-dynamic';

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ resolved?: string }>;
}) {
  const { id } = await params;
  const { resolved } = await searchParams;

  let report: AdminReportView | null = null;
  let error: string | null = null;
  try {
    report = await adminFetch<AdminReportView>(`/admin/reports/${id}`);
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <p>
        <Link href="/reports">&larr; Back to the queue</Link>
      </p>

      {error !== null ? <div className="error">{error}</div> : null}

      {report !== null ? (
        <>
          <h1>
            Report <span className="mono">{report.id}</span>
          </h1>
          <p className="lede">
            <StatusBadge status={report.status} /> - filed {formatDateTime(report.created_at)}
          </p>

          {resolved === '1' ? (
            <div className="card">
              <p className="notice">The report was resolved.</p>
            </div>
          ) : null}

          <div className="card">
            <h2>What was reported</h2>
            <dl className="meta">
              <dt>Reason</dt>
              <dd className="mono">{report.reason_code}</dd>
              <dt>Reporter</dt>
              <dd className="mono">{report.reporter_user_id}</dd>
              <dt>Reported profile</dt>
              <dd className="mono">{report.reported_profile_id ?? '-'}</dd>
              <dt>Reported account</dt>
              <dd className="mono">{report.reported_user_id ?? '-'}</dd>
              <dt>Description</dt>
              <dd>{report.description ?? '-'}</dd>
            </dl>
          </div>

          {isTerminalReportStatus(report.status) ? (
            <div className="card">
              <h2>Resolution</h2>
              <dl className="meta">
                <dt>Outcome</dt>
                <dd>{REPORT_STATUS_LABELS[report.status]}</dd>
                <dt>Action</dt>
                <dd>{report.action_taken ? REPORT_ACTION_LABELS[report.action_taken] : '-'}</dd>
                <dt>Notes</dt>
                <dd>{report.review_notes ?? '-'}</dd>
                <dt>Resolved</dt>
                <dd>{formatDateTime(report.resolved_at)}</dd>
                <dt>By</dt>
                <dd className="mono">{report.resolved_by_admin_id ?? '-'}</dd>
              </dl>
            </div>
          ) : (
            <div className="card">
              <h2>Resolve this report</h2>
              <ReviewForm reportId={report.id} />
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
