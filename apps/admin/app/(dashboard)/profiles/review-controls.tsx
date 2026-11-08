'use client';

import { useState } from 'react';
import { useAdminAction } from '@/lib/use-admin-action';
import { approveProfileAction, rejectProfileAction } from './actions';

/**
 * Approve / reject for one profile.
 *
 * The reason box opens in place, like the photo queue's, so the profile being
 * judged stays on screen while the reason is written. A rejected submit keeps
 * both the open box and the typed reason: clearing them would lose the
 * explanation and leave the next press rejecting with nothing to send.
 *
 * Only a profile awaiting review gets the buttons. A decision is made once: the
 * API refuses to review anything that is not `PENDING_REVIEW`, so offering the
 * controls on an approved or rejected row would only produce a 409. An approval
 * made in error is undone by suspending the account, which is a different
 * decision and lives on the member's page.
 */
export function ProfileReviewControls({
  profileId,
  status,
}: {
  profileId: string;
  status: string;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const approve = useAdminAction(approveProfileAction);
  const reject = useAdminAction(rejectProfileAction);

  if (status !== 'PENDING_REVIEW') {
    return null;
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={approve.pending || reject.pending}
          onClick={() => approve.run({ id: profileId })}
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
          <label htmlFor={`profile-reason-${profileId}`}>Reason for rejection</label>
          <input
            id={`profile-reason-${profileId}`}
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
              onClick={() => reject.run({ id: profileId, rejection_reason: reason })}
            >
              {reject.pending ? 'Rejecting…' : 'Reject profile'}
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
