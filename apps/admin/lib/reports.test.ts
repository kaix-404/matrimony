import { REPORT_ACTION_TYPES, REPORT_STATUSES } from '@matrimony/shared';
import {
  REPORT_ACTION_LABELS,
  REPORT_STATUS_LABELS,
  actionRequiresNotes,
  buildReviewPayload,
  isTerminalReportStatus,
  reviewFormError,
  statusForAction,
} from './reports';

describe('statusForAction', () => {
  it('files a dismissal as DISMISSED', () => {
    expect(statusForAction('DISMISS')).toBe('DISMISSED');
  });

  it('files every other action as ACTIONED', () => {
    for (const action of REPORT_ACTION_TYPES) {
      if (action === 'DISMISS') {
        continue;
      }
      expect(statusForAction(action)).toBe('ACTIONED');
    }
  });
});

describe('actionRequiresNotes', () => {
  it('requires notes for every action except a dismissal', () => {
    for (const action of REPORT_ACTION_TYPES) {
      expect(actionRequiresNotes(action)).toBe(action !== 'DISMISS');
    }
  });
});

describe('buildReviewPayload', () => {
  it('omits notes entirely when they are blank', () => {
    expect(buildReviewPayload('DISMISS', '   ')).toEqual({ status: 'DISMISSED', action: 'DISMISS' });
  });

  it('trims and includes notes when present', () => {
    expect(buildReviewPayload('SUSPEND', '  repeated harassment ')).toEqual({
      status: 'ACTIONED',
      action: 'SUSPEND',
      notes: 'repeated harassment',
    });
  });
});

describe('reviewFormError', () => {
  it('rejects a sanction with no notes', () => {
    expect(reviewFormError('WARN', '  ')).not.toBeNull();
  });

  it('allows a dismissal with no notes', () => {
    expect(reviewFormError('DISMISS', '')).toBeNull();
  });
});

describe('labels', () => {
  it('labels every status and action', () => {
    for (const status of REPORT_STATUSES) {
      expect(REPORT_STATUS_LABELS[status]).toBeTruthy();
    }
    for (const action of REPORT_ACTION_TYPES) {
      expect(REPORT_ACTION_LABELS[action]).toBeTruthy();
    }
  });
});

describe('isTerminalReportStatus', () => {
  it('treats only DISMISSED and ACTIONED as terminal', () => {
    expect(isTerminalReportStatus('OPEN')).toBe(false);
    expect(isTerminalReportStatus('IN_REVIEW')).toBe(false);
    expect(isTerminalReportStatus('DISMISSED')).toBe(true);
    expect(isTerminalReportStatus('ACTIONED')).toBe(true);
  });
});
