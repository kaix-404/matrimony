'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { initialAdminActionState, type AdminActionState } from './admins';

/**
 * Runs an administrator-management action and refreshes the page on success.
 *
 * The body is built here rather than read from a form, because React resets a
 * form when an action it owns returns; reading the submitted fields from state
 * means a rejected action leaves the operator's input exactly where it was.
 *
 * A successful action revalidates the page on the server, and `router.refresh()`
 * then re-renders it, so the table shows the new roles or MFA state immediately
 * instead of waiting for a manual reload. `onSuccess` runs first, which is where
 * a form clears itself: clearing on submit would discard what the operator typed
 * when the action is rejected.
 */
export function useAdminAction(
  action: (previous: AdminActionState, formData: FormData) => Promise<AdminActionState>,
  onSuccess?: () => void,
) {
  const router = useRouter();
  const [state, setState] = useState(initialAdminActionState);
  const [pending, startTransition] = useTransition();

  function run(fields: Record<string, string | string[]>): void {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          formData.append(key, entry);
        }
      } else {
        formData.set(key, value);
      }
    }

    startTransition(async () => {
      const result = await action(state, formData);
      setState(result);
      if (result.error === null) {
        onSuccess?.();
        router.refresh();
      }
    });
  }

  return { state, pending, run };
}
