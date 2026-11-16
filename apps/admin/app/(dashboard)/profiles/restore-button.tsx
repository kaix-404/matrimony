'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { restoreProfileAction } from './actions';

/**
 * Lifts a suspension from the queue's Suspended tab.
 *
 * Same inline reason box as suspension: a suspension without a recorded reason
 * for lifting it would leave the audit trail one-sided, and `window.prompt` is
 * dismissed by anything that declines dialogs.
 */
export function RestoreProfileButton({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError('Give a reason of at least 5 characters.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await restoreProfileAction(profileId, trimmed);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setReason('');
    router.refresh();
  }

  if (!open) {
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        <button
          type="button"
          className="button"
          onClick={() => setOpen(true)}
          style={{ justifySelf: 'start' }}
        >
          Lift suspension
        </button>
        {error !== null ? <div className="error">{error}</div> : null}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label htmlFor={`restore-reason-${profileId}`} className="mono">
        Reason (recorded in the audit log)
      </label>
      <textarea
        id={`restore-reason-${profileId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={2}
        maxLength={500}
        autoFocus
        aria-invalid={error !== null}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="button" onClick={restore} disabled={busy}>
          {busy ? 'Restoring…' : 'Confirm restore'}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
      {error !== null ? <div className="error">{error}</div> : null}
    </div>
  );
}
