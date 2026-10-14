import type { ReportStatus } from '@matrimony/shared';
import { REPORT_STATUS_LABELS } from '@/lib/reports';

const TONE: Record<ReportStatus, string> = {
  OPEN: 'badge-open',
  IN_REVIEW: 'badge-review',
  DISMISSED: 'badge-closed',
  ACTIONED: 'badge-danger',
};

/** A colour-coded report status pill shared by the queue and the detail view. */
export function StatusBadge({ status }: { status: ReportStatus }) {
  return <span className={`badge ${TONE[status]}`}>{REPORT_STATUS_LABELS[status]}</span>;
}
