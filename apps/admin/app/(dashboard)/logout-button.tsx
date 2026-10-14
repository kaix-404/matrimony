'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Revokes the session server-side, then returns to the login page. */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut(): Promise<void> {
    setBusy(true);
    try {
      await fetch('/api/session/logout', { method: 'POST' });
    } catch {
      // The cookie is cleared server-side even if the revocation call failed;
      // proceed to the login page regardless.
    }
    router.replace('/login');
    router.refresh();
  }

  return (
    <button type="button" className="btn btn-secondary" onClick={signOut} disabled={busy}>
      {busy ? 'Signing out...' : 'Sign out'}
    </button>
  );
}
