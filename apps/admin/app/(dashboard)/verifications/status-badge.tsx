import type { AdminVerificationStatus } from '@matrimony/shared';

/**
 * The four stored states, in the words support uses on the phone.
 *
 * `PENDING` is not "processing on our side": it means the member opened a
 * DigiLocker session and has not finished it, so the label says who is being
 * waited on rather than implying the system is busy.
 */
const LABELS: Record<AdminVerificationStatus, string> = {
  PENDING: 'Awaiting member',
  VERIFIED: 'Verified',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
};

const TONE: Record<AdminVerificationStatus, string> = {
  PENDING: 'badge-review',
  VERIFIED: 'badge-ok',
  FAILED: 'badge-danger',
  EXPIRED: 'badge-closed',
};

export function VerificationStatusBadge({ status }: { status: AdminVerificationStatus }) {
  return <span className={`badge ${TONE[status]}`}>{LABELS[status]}</span>;
}
