'use client';

import { useState } from 'react';
import { useAdminAction } from '@/lib/use-admin-action';
import { reviewVerificationAction } from './actions';

/**
 * Approve / reject one manually uploaded identity document.
 *
 * The rejection reason is asked for in place, next to the document link, so the
 * reviewer can look at what they are refusing while they write it. Approving is
 * the same transition a DigiLocker success produces — the API decides that, not
 * this component.
 */
export function VerificationReviewControls({ verificationId }: { verificationId: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const approve = useAdminAction(reviewVerificationAction);
  const reject = useAdminAction(reviewVerificationAction);

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={approve.pending || reject.pending}
          onClick={() => approve.run({ id: verificationId, decision: 'APPROVE' })}
        >
          {approve.pending ? 'Approving…' : 'Approve identity'}
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
          <label htmlFor={`note-${verificationId}`}>Reason for rejection</label>
          <input
            id={`note-${verificationId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What should the member fix?"
            maxLength={500}
          />
          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={reject.pending || reason.trim().length === 0}
              onClick={() => reject.run({ id: verificationId, decision: 'REJECT', note: reason })}
            >
              {reject.pending ? 'Rejecting…' : 'Reject document'}
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
