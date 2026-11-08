import {
  PROFILE_REVIEW_STATUSES,
  PROFILE_STATUS_LABELS,
  rejectionReasonFrom,
} from './profile-review';

/**
 * The rejection reason a reviewer typed, normalised.
 *
 * A reason is mandatory on the API, and a field holding only spaces is the case
 * that catches people: it looks filled in, and without this it would reach the
 * server as a 400 rather than as the page's own message.
 */
describe('rejectionReasonFrom', () => {
  it('trims what was pasted in', () => {
    expect(rejectionReasonFrom('  Photo is someone else  ')).toBe('Photo is someone else');
  });

  it('treats a whitespace-only box as no reason at all', () => {
    expect(rejectionReasonFrom('   \n ')).toBeNull();
  });

  it('treats an empty box as no reason at all', () => {
    expect(rejectionReasonFrom('')).toBeNull();
  });
});

describe('PROFILE_STATUS_LABELS', () => {
  it('names every status the queue can filter by', () => {
    expect(PROFILE_REVIEW_STATUSES).toEqual(['PENDING_REVIEW', 'APPROVED', 'REJECTED']);
    expect(Object.keys(PROFILE_STATUS_LABELS)).toEqual([...PROFILE_REVIEW_STATUSES]);
  });
});
