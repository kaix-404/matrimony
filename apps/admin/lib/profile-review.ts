/**
 * Labels for the profile review queue (section 26).
 *
 * The statuses a reviewer works with, in the order they appear on the page.
 * `DRAFT` is deliberately absent: a draft has not been submitted, so it belongs
 * to the member, not to a queue, and every column here would be a guess about
 * work that is not finished.
 */
export const PROFILE_REVIEW_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;

export type ProfileReviewStatus = (typeof PROFILE_REVIEW_STATUSES)[number];

export const PROFILE_STATUS_LABELS: Record<ProfileReviewStatus, string> = {
  PENDING_REVIEW: 'Awaiting review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

/**
 * The reason to send for a rejection, or nothing.
 *
 * The API requires a non-empty reason, so an all-whitespace field is treated as
 * missing here rather than being sent to fail validation server-side, and the
 * trailing whitespace a paste brings along is trimmed off the stored copy.
 */
export function rejectionReasonFrom(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
