import Link from 'next/link';
import { REPORT_STATUSES, type ReportStatus } from '@matrimony/shared';
import { REPORT_STATUS_LABELS } from '@/lib/reports';
import { adminFetch } from '@/lib/api';
import type { AdminReportList } from '@/lib/admin-types';
import { describeError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { StatusBadge } from './status-badge';

/**
 * The moderation queue (section 30).
 *
 * `force-dynamic` is deliberate: the queue must reflect a report another
 * administrator resolved a moment ago, and it must never be prerendered at
 * build time - where there is no session, and therefore nothing to show.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Moderation queue - Networth Matrimony Admin' };

function asStatus(value: string | undefined): ReportStatus | undefined {
  return value !== undefined && (REPORT_STATUSES as readonly string[]).includes(value)
    ? (value as ReportStatus)
    : undefined;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = asStatus(rawStatus);

  let list: AdminReportList | null = null;
  let error: string | null = null;
  try {
    list = await adminFetch<AdminReportList>(status ? `/admin/reports?status=${status}` : '/admin/reports');
  } catch (caught) {
    error = describeError(caught);
  }

  const filters: Array<{ value: ReportStatus | null; label: string }> = [
    { value: null, label: 'All' },
    ...REPORT_STATUSES.map((value) => ({ value, label: REPORT_STATUS_LABELS[value] })),
  ];

  return (
    <>
      <h1>Moderation queue</h1>
      <p className="lede">
        Reports filed by members, newest first. Resolving a report removes it from the open queue.
      </p>

      <div className="filters">
        {filters.map((filter) => {
          const active = filter.value === status || (filter.value === null && status === undefined);
          const href = filter.value === null ? '/reports' : `/reports?status=${filter.value}`;
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
          {list.reports.length === 0 ? (
            <p className="notice">No reports match this filter.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Reported account</th>
                  <th>Filed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.reports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <div className="mono">{report.reason_code}</div>
                      <div className="mono" style={{ color: 'var(--muted)' }}>
                        {report.id}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={report.status} />
                    </td>
                    <td className="mono">{report.reported_user_id ?? report.reported_profile_id ?? '-'}</td>
                    <td>{formatDateTime(report.created_at)}</td>
                    <td>
                      <Link href={`/reports/${report.id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {list.hasMore ? (
            <p className="notice">More reports exist; narrow the filter to see the rest.</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
