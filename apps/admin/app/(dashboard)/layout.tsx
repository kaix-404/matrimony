import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readAdminClaims } from '@/lib/jwt';
import { ACCESS_COOKIE, EMAIL_COOKIE } from '@/lib/session';
import { LogoutButton } from './logout-button';
import { NavLinks } from './nav-links';

/**
 * The authenticated shell.
 *
 * The middleware has already turned an expired access token into a fresh one, so
 * by the time this renders the token is valid. The check here is belt and
 * braces: if the token is somehow missing or not an `admin_access` token, the
 * request is sent to the login page rather than rendering a shell around pages
 * that would each fail on their own.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const claims = readAdminClaims(store.get(ACCESS_COOKIE)?.value);

  if (claims === null) {
    redirect('/login');
  }

  const email = store.get(EMAIL_COOKIE)?.value ?? 'administrator';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Networth Matrimony</div>
        <NavLinks />
      </aside>
      <div className="content">
        <header className="topbar">
          <span className="who">
            Signed in as {email}
            {claims.roles.length > 0 ? ` - ${claims.roles.join(', ')}` : ''}
          </span>
          <LogoutButton />
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
