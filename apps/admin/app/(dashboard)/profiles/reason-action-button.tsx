'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { restoreProfileAction, suspendProfileAction } from './actions';

/**
 * Suspend, or lift a suspension, from the review queue.
 *
 * Both moves are the same interaction with a different meaning, so they share one
 * component: a reason box that opens in place, records the explanation the audit
 * log keeps, and closes only when the API accepted it. `window.prompt` was tried
 * first and was dismissed by anything that declines dialogs, which left the
 * button looking inert and a cancel indistinguishable from a dismissal.
 */
const COPY = {
  suspend: {
    open: 'Suspend account',
    confirm: 'Confirm suspension',
    busy: 'Suspending…',
    className: 'button danger',
  },
  restore: {
    open: 'Lift suspension',
    confirm: 'Confirm restore',
    busy: 'Restoring…',
    className: 'button',
  },
} as const;

export function ReasonActionButton({
  profileId,
  action,
}: {
  profileId: string;
  action: 'suspend' | 'restore';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[action];

  async function submit() {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError('Give a reason of at least 5 characters.');
      return;
    }

    setBusy(true);
    setError(null);
    const result =
      action === 'suspend'
        ? await suspendProfileAction(profileId, trimmed)
        : await restoreProfileAction(profileId, trimmed);
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
          className={copy.className}
          onClick={() => setOpen(true)}
          style={{ justifySelf: 'start' }}
        >
          {copy.open}
        </button>
        {error !== null ? <div className="error">{error}</div> : null}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label htmlFor={`${action}-reason-${profileId}`} className="mono">
        Reason (recorded in the audit log)
      </label>
      <textarea
        id={`${action}-reason-${profileId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={2}
        maxLength={500}
        autoFocus
        aria-invalid={error !== null}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className={copy.className} onClick={submit} disabled={busy}>
          {busy ? copy.busy : copy.confirm}
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
