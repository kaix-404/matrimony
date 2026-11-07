import { DATA_REQUEST_STATUSES, DATA_REQUEST_TYPES } from '@matrimony/shared';
import {
  DATA_REQUEST_STATUS_LABELS,
  DATA_REQUEST_TYPE_LABELS,
  buildResolvePayload,
  isOverdue,
  isTerminalDataRequestStatus,
  resolveFormError,
} from './data-requests';

describe('isTerminalDataRequestStatus', () => {
  it('treats only COMPLETED and REJECTED as terminal', () => {
    expect(isTerminalDataRequestStatus('REQUESTED')).toBe(false);
    expect(isTerminalDataRequestStatus('IN_PROGRESS')).toBe(false);
    expect(isTerminalDataRequestStatus('COMPLETED')).toBe(true);
    expect(isTerminalDataRequestStatus('REJECTED')).toBe(true);
  });
});

describe('isOverdue', () => {
  const now = new Date('2026-11-07T12:00:00.000Z');

  it('flags an open request whose deadline has passed', () => {
    expect(isOverdue({ status: 'REQUESTED', dueAt: '2026-11-01T00:00:00.000Z' }, now)).toBe(true);
    expect(isOverdue({ status: 'IN_PROGRESS', dueAt: '2026-11-01T00:00:00.000Z' }, now)).toBe(true);
  });

  it('leaves an open request inside its deadline alone', () => {
    expect(isOverdue({ status: 'REQUESTED', dueAt: '2026-11-20T00:00:00.000Z' }, now)).toBe(false);
  });

  it('never calls a resolved request overdue, however late it closed', () => {
    expect(isOverdue({ status: 'COMPLETED', dueAt: '2026-10-01T00:00:00.000Z' }, now)).toBe(false);
    expect(isOverdue({ status: 'REJECTED', dueAt: '2026-10-01T00:00:00.000Z' }, now)).toBe(false);
  });

  it('does not treat an unparseable deadline as a breach', () => {
    expect(isOverdue({ status: 'REQUESTED', dueAt: 'not-a-date' }, now)).toBe(false);
  });
});

describe('buildResolvePayload', () => {
  it('omits notes entirely when they are blank', () => {
    expect(buildResolvePayload('COMPLETED', '   ')).toEqual({ status: 'COMPLETED' });
  });

  it('trims and includes notes when present', () => {
    expect(buildResolvePayload('REJECTED', '  identity could not be established ')).toEqual({
      status: 'REJECTED',
      resolutionNotes: 'identity could not be established',
    });
  });
});

describe('resolveFormError', () => {
  it('rejects a refusal with no notes', () => {
    expect(resolveFormError('REJECTED', '  ')).not.toBeNull();
  });

  it('allows a completion with no notes', () => {
    expect(resolveFormError('COMPLETED', '')).toBeNull();
  });
});

describe('labels', () => {
  it('labels every status and type', () => {
    for (const status of DATA_REQUEST_STATUSES) {
      expect(DATA_REQUEST_STATUS_LABELS[status]).toBeTruthy();
    }
    for (const type of DATA_REQUEST_TYPES) {
      expect(DATA_REQUEST_TYPE_LABELS[type]).toBeTruthy();
    }
  });
});
