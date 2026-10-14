import {
  REPORT_ACTION_TYPES,
  type AdminReviewReportInput,
  type ReportActionType,
  type ReportStatus,
} from '@matrimony/shared';

/**
 * Presentation helpers for the moderation queue.
 *
 * These mirror the rules the API enforces (section 30) so the review form can
 * guide an administrator before the request is sent. The API is still the
 * authority: a payload that slips past these checks is rejected there, not
 * trusted here.
 */

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  OPEN: 'Open',
  IN_REVIEW: 'In review',
  DISMISSED: 'Dismissed',
  ACTIONED: 'Actioned',
};

export const REPORT_ACTION_LABELS: Record<ReportActionType, string> = {
  DISMISS: 'Dismiss (no violation)',
  WARN: 'Warn the reported member',
  SUSPEND: 'Suspend the reported account',
  BLOCK: 'Record a block',
  DELETE: 'Record a deletion',
};

/** The actions a reviewer may pick, in the order the dropdown shows them. */
export const REPORT_ACTIONS: ReportActionType[] = [...REPORT_ACTION_TYPES];

/** A terminal report has been resolved and cannot be resolved again. */
export function isTerminalReportStatus(status: ReportStatus): boolean {
  return status === 'DISMISSED' || status === 'ACTIONED';
}

/**
 * The lifecycle status an action must be filed under. `DISMISS` is the only
 * action that closes a report as dismissed; every other action resolves it.
 */
export function statusForAction(action: ReportActionType): 'DISMISSED' | 'ACTIONED' {
  return action === 'DISMISS' ? 'DISMISSED' : 'ACTIONED';
}

/** Only a dismissal may omit notes; any sanction has to be explained. */
export function actionRequiresNotes(action: ReportActionType): boolean {
  return action !== 'DISMISS';
}

/**
 * Validates the review form the same way the API will, returning the first
 * problem or null when the payload is well formed.
 */
export function reviewFormError(action: ReportActionType, notes: string): string | null {
  if (actionRequiresNotes(action) && notes.trim().length === 0) {
    return 'Add review notes explaining the action before resolving the report.';
  }
  return null;
}

/** Builds the request body, omitting `notes` entirely when it is blank. */
export function buildReviewPayload(action: ReportActionType, notes: string): AdminReviewReportInput {
  const trimmed = notes.trim();
  const base = { status: statusForAction(action), action };
  return trimmed.length > 0 ? { ...base, notes: trimmed } : base;
}

/**
 * The state the resolve-report form renders from. It carries only an error
 * string: a successful review redirects to the refreshed detail page rather than
 * returning a value, so there is no success case to represent here.
 */
export interface ReviewState {
  error: string | null;
}

export const initialReviewState: ReviewState = { error: null };
