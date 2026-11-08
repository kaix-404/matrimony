'use client';

import { useState } from 'react';
import { useAdminAction } from '@/lib/use-admin-action';
import { reviewPhotoAction } from './actions';

/**
 * Approve / reject for one photo.
 *
 * The reject path asks for its reason in place rather than in a dialog, so the
 * photo being judged stays on screen while the reason is written. Which button
 * is armed lives in state, and a rejected submit keeps both the armed state and
 * the typed reason: clearing on submit would lose the explanation and leave the
 * next press rejecting with no reason at all.
 */
export function ReviewControls({ photoId }: { photoId: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const approve = useAdminAction(reviewPhotoAction);
  const reject = useAdminAction(reviewPhotoAction);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={approve.pending || reject.pending}
          onClick={() => approve.run({ id: photoId, decision: 'APPROVE' })}
        >
          {approve.pending ? 'Approving…' : 'Approve'}
        </button>
        {rejecting ? null : (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={approve.pending}
            onClick={() => setRejecting(true)}
          >
            Reject
          </button>
        )}
      </div>

      {rejecting ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <label htmlFor={`reason-${photoId}`}>Reason for rejection</label>
          <input
            id={`reason-${photoId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What should the member change?"
            maxLength={500}
          />
          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={reject.pending || reason.trim().length === 0}
              onClick={() =>
                reject.run({ id: photoId, decision: 'REJECT', rejection_reason: reason })
              }
            >
              {reject.pending ? 'Rejecting…' : 'Reject photo'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={reject.pending}
              onClick={() => {
                setRejecting(false);
                setReason('');
              }}
            >
              Cancel
            </button>
          </div>
          {reject.state.error !== null ? <p className="error">{reject.state.error}</p> : null}
        </div>
      ) : null}

      {approve.state.error !== null ? <p className="error">{approve.state.error}</p> : null}
    </div>
  );
}
