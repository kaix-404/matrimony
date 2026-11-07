import type { DataRequestStatus } from '@matrimony/shared';

/**
 * The four stored states, in the words an administrator uses.
 *
 * `REQUESTED` and `IN_PROGRESS` are both open; the second only says a colleague
 * has picked the request up, not that the member has been answered.
 */
const LABELS: Record<DataRequestStatus, string> = {
  REQUESTED: 'Requested',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
};

const TONE: Record<DataRequestStatus, string> = {
  REQUESTED: 'badge-open',
  IN_PROGRESS: 'badge-review',
  COMPLETED: 'badge-ok',
  REJECTED: 'badge-danger',
};

export function DataRequestStatusBadge({ status }: { status: DataRequestStatus }) {
  return <span className={`badge ${TONE[status]}`}>{LABELS[status]}</span>;
}
