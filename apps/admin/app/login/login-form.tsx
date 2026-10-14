'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The two-step sign-in form.
 *
 * Step one exchanges email and password; if the administrator has MFA enrolled
 * the API hands back a challenge instead of a session, and the form swaps to
 * step two for the six-digit code. The challenge token is held in component
 * state, never in a cookie or storage - it is only valid for a few minutes and
 * for this one exchange.
 */

interface LoginResponse {
  ok?: boolean;
  mfa_required?: boolean;
  challenge_token?: string;
  message?: string;
}

type Step = 'password' | 'mfa';

async function readJson(response: Response): Promise<LoginResponse> {
  try {
    return (await response.json()) as LoginResponse;
  } catch {
    return {};
  }
}

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitPassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/session/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await readJson(response);

      if (!response.ok) {
        setError(data.message ?? 'Email or password is incorrect.');
        return;
      }

      if (data.mfa_required === true && data.challenge_token !== undefined) {
        setChallengeToken(data.challenge_token);
        setStep('mfa');
        return;
      }

      router.replace('/');
      router.refresh();
    } catch {
      setError('Could not reach the server. Is the API running?');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/session/mfa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challenge_token: challengeToken, code, email }),
      });
      const data = await readJson(response);

      if (!response.ok) {
        setError(data.message ?? 'That code was not accepted.');
        return;
      }

      router.replace('/');
      router.refresh();
    } catch {
      setError('Could not reach the server. Is the API running?');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'mfa') {
    return (
      <form onSubmit={submitCode}>
        <p className="notice">Enter the six-digit code from your authenticator app.</p>
        <label htmlFor="code">Authentication code</label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
        />
        {error !== null ? <div className="error">{error}</div> : null}
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Verifying...' : 'Verify code'}
          </button>
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setStep('password');
              setCode('');
              setError(null);
            }}
          >
            Start over
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitPassword}>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        required
        autoFocus
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        minLength={8}
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {error !== null ? <div className="error">{error}</div> : null}
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </div>
    </form>
  );
}
