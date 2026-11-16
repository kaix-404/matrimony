'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { suspendProfileAction } from './actions';

/**
 * Suspends a profile from the review queue.
 *
 * The reason is asked for inline rather than through `window.prompt`: a browser
 * prompt blocks the page, cannot be styled, and is dismissed by anything that
 * declines dialogs — including a tester's automation — which made the button
 * look inert. It is also what gets audited and what the member is told, so it
 * belongs in the page, not in a modal string.
 */
export function SuspendProfileButton({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suspend() {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError('Give a reason of at least 5 characters.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await suspendProfileAction(profileId, trimmed);
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
          className="button danger"
          onClick={() => setOpen(true)}
          style={{ justifySelf: 'start' }}
        >
          Suspend account
        </button>
        {error !== null ? <div className="error">{error}</div> : null}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label htmlFor={`suspend-reason-${profileId}`} className="mono">
        Reason (recorded in the audit log)
      </label>
      <textarea
        id={`suspend-reason-${profileId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={2}
        maxLength={500}
        autoFocus
        aria-invalid={error !== null}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="button danger" onClick={suspend} disabled={busy}>
          {busy ? 'Suspending…' : 'Confirm suspension'}
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
