import {
  DATA_REQUEST_STATUSES,
  type AdminResolveDataRequestInput,
  type DataRequestStatus,
  type DataRequestType,
} from '@matrimony/shared';

/**
 * Presentation helpers for the data-subject request queue (sections 21 and 32).
 *
 * These mirror the rules the API enforces so the queue can flag a lapsed deadline
 * and the resolve form can catch a malformed resolution before it is sent. The
 * API remains the authority: anything that slips past these checks is rejected
 * there, not trusted here.
 */

export const DATA_REQUEST_STATUS_LABELS: Record<DataRequestStatus, string> = {
  REQUESTED: 'Requested',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
};

/** The statuses in the order the filter chips show them. */
export const DATA_REQUEST_STATUS_FILTERS: DataRequestStatus[] = [...DATA_REQUEST_STATUSES];

export const DATA_REQUEST_TYPE_LABELS: Record<DataRequestType, string> = {
  EXPORT: 'Data export',
  ERASURE: 'Erasure',
};

/** What each request type asks of us, in the words the detail page uses. */
export const DATA_REQUEST_TYPE_DESCRIPTIONS: Record<DataRequestType, string> = {
  EXPORT: 'A machine-readable copy of everything held about the member.',
  ERASURE: "Deletion of the member's personal data under the right to be forgotten.",
};

/**
 * A resolved request cannot be resolved again.
 *
 * `REQUESTED` and `IN_PROGRESS` are both still open: the second only records
 * that a colleague has picked the request up, and it does not stop the clock.
 */
export function isTerminalDataRequestStatus(status: DataRequestStatus): boolean {
  return status === 'COMPLETED' || status === 'REJECTED';
}

/**
 * Whether the statutory clock has run out.
 *
 * A resolved request is never overdue, however late it was closed: the deadline
 * is a promise about when we answer, so once answered it no longer applies. An
 * unparseable `dueAt` is not treated as overdue, because a blank deadline is a
 * data problem to fix rather than a breach to chase.
 */
export function isOverdue(
  request: { status: DataRequestStatus; dueAt: string },
  now: Date,
): boolean {
  if (isTerminalDataRequestStatus(request.status)) {
    return false;
  }
  const due = new Date(request.dueAt);
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
}

/**
 * Validates the resolve form the same way the API will, returning the first
 * problem or null when the payload is well formed.
 *
 * Only a rejection must be explained, which is the API's rule as well: a refusal
 * is a decision the data subject is entitled to read, while a completed export
 * speaks for itself.
 */
export function resolveFormError(
  status: 'COMPLETED' | 'REJECTED',
  notes: string,
): string | null {
  if (status === 'REJECTED' && notes.trim().length === 0) {
    return 'Add a note explaining why the request was refused; the member is entitled to it.';
  }
  return null;
}

/** Builds the request body, omitting `resolutionNotes` entirely when it is blank. */
export function buildResolvePayload(
  status: 'COMPLETED' | 'REJECTED',
  notes: string,
): AdminResolveDataRequestInput {
  const trimmed = notes.trim();
  const base = { status };
  return trimmed.length > 0 ? { ...base, resolutionNotes: trimmed } : base;
}

/**
 * The state the resolve form renders from. It carries only an error string: a
 * successful resolution redirects to the refreshed page rather than returning a
 * value, so there is no success case to represent here.
 */
export interface ResolveState {
  error: string | null;
}

export const initialResolveState: ResolveState = { error: null };
