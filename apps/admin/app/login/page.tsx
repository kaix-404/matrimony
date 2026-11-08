import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in - Networth Matrimony Admin',
};

/**
 * Why the previous attempt failed, when the form was submitted without
 * JavaScript and came back as a redirect.
 *
 * The redirect carries a short code and nothing else: the email and password the
 * administrator typed are not repeated in the URL, where they would be kept in
 * the browser's history and in every access log along the way. The wording is the
 * same as the scripted form's, so a wrong password reads identically either way.
 */
const PROBLEMS: Record<string, string> = {
  invalid: 'Enter a valid email address and a password of at least 8 characters.',
  rejected: 'Email or password is incorrect.',
  unreachable: 'Could not reach the server. Is the API running?',
  mfa: 'This account uses multi-factor authentication, so signing in needs JavaScript enabled. Enable it and try again.',
  unexpected: 'The server returned an unexpected sign-in response.',
};

/** The unauthenticated entry point. It renders without the dashboard shell. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.problem;
  const problem = Array.isArray(raw) ? raw[0] : raw;

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Admin sign-in</h1>
        <p className="sub">Networth Matrimony operations console</p>
        <LoginForm initialError={problem === undefined ? null : (PROBLEMS[problem] ?? null)} />
      </div>
    </div>
  );
}
