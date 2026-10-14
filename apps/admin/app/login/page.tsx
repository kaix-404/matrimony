import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in - Networth Matrimony Admin',
};

/** The unauthenticated entry point. It renders without the dashboard shell. */
export default function LoginPage() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Admin sign-in</h1>
        <p className="sub">Networth Matrimony operations console</p>
        <LoginForm />
      </div>
    </div>
  );
}
