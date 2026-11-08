import { buildPhotoReviewPayload, PHOTO_STATUS_LABELS } from './photos';

/**
 * The photo review payload builder.
 *
 * The rule it exists for is small but easy to get wrong: the API refuses an
 * approval that carries a reason, so a reason left in the box from a previous
 * rejection must not be sent with the approval that follows it.
 */
describe('buildPhotoReviewPayload', () => {
  it('omits the reason on an approval, even if one was typed', () => {
    expect(buildPhotoReviewPayload('APPROVE', 'Blurry')).toEqual({ decision: 'APPROVE' });
  });

  it('sends a trimmed reason on a rejection', () => {
    expect(buildPhotoReviewPayload('REJECT', '  Face not visible  ')).toEqual({
      decision: 'REJECT',
      rejection_reason: 'Face not visible',
    });
  });

  it('sends no reason key at all when the box is blank, so the schema can refuse it', () => {
    expect(buildPhotoReviewPayload('REJECT', '   ')).toEqual({ decision: 'REJECT' });
  });
});

describe('PHOTO_STATUS_LABELS', () => {
  it('names every status the queue can filter by', () => {
    expect(Object.keys(PHOTO_STATUS_LABELS)).toEqual(['PENDING_REVIEW', 'APPROVED', 'REJECTED']);
  });
});
