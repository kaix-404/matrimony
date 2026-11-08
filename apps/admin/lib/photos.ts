import type { AdminActionState } from './admins';

/**
 * Labels for the photo review queue (section 9).
 *
 * `PENDING_REVIEW` is spelled out rather than shortened to "Pending": this is the
 * one state in which a member is invisible to everybody else, so the queue should
 * say what is being waited for.
 */
export const PHOTO_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'Awaiting review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const initialPhotoReviewState: AdminActionState = { error: null };

/**
 * The payload for a decision.
 *
 * `rejection_reason` is omitted rather than sent empty on an approval, because
 * the contract refuses an approval that carries a reason at all: a stale field
 * left in a form must not be stored as an explanation for a photo that was
 * accepted.
 */
export function buildPhotoReviewPayload(
  decision: 'APPROVE' | 'REJECT',
  rejectionReason: string,
): { decision: 'APPROVE' | 'REJECT'; rejection_reason?: string } {
  if (decision === 'APPROVE') return { decision };
  const trimmed = rejectionReason.trim();
  return trimmed.length > 0 ? { decision, rejection_reason: trimmed } : { decision };
}
