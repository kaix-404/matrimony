'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { adminFetch } from '../../../lib/api';

/**
 * Suspends a profile from the review queue.
 *
 * The reason is asked for up front because it is what gets audited and what the
 * member is told; a bare "suspended" would leave support with nothing to say.
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
    try {
      await adminFetch(`/admin/profiles/${profileId}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not suspend the profile.');
    } finally {
      setBusy(false);
    }
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
