import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuth } from './auth-context';

/**
 * Redirects to the sign-in screen when there is no session.
 *
 * `ready` is false while the stored session is still being read and whenever
 * the user is signed out, so a gated screen can render a spinner instead of its
 * empty state. Without the `loading` case an already-signed-in user would see
 * the sign-in screen flash on every cold start, because the redirect effect
 * runs before the Keystore read resolves.
 */
export function useRequireAuth(): { ready: boolean } {
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'signedOut') {
      router.replace('/auth');
    }
  }, [status]);

  return { ready: status === 'signedIn' };
}
