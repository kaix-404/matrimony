'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { suspendProfileAction } from './actions';

/**
 * Suspends a profile from the review queue.
 *
 * The reason is asked for up front because it is what gets audited and what the
 * member is told; a bare "suspended" would leave support with nothing to say.
 * The request itself goes through a server action — the admin API client reads
 * the session cookie on the server, so it cannot be imported here.
 */
export function SuspendProfileButton({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suspend() {
    const reason = window.prompt('Why is this profile being suspended?');
    if (reason === null) return;
    if (reason.trim().length < 5) {
      setError('Give a reason of at least 5 characters.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await suspendProfileAction(profileId, reason.trim());
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <button
        type="button"
        className="button danger"
        onClick={suspend}
        disabled={busy}
        style={{ justifySelf: 'start' }}
      >
        {busy ? 'Suspending…' : 'Suspend account'}
      </button>
      {error !== null ? <div className="error">{error}</div> : null}
    </div>
  );
}
