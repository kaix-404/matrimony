import Link from 'next/link';
import { cookies } from 'next/headers';
import { readAdminClaims } from '@/lib/jwt';
import { ACCESS_COOKIE } from '@/lib/session';

/** The dashboard landing page: what this administrator can reach, and where. */
export default async function OverviewPage() {
  const claims = readAdminClaims((await cookies()).get(ACCESS_COOKIE)?.value);
  const roles = claims?.roles ?? [];

  return (
    <>
      <h1>Overview</h1>
      <p className="lede">Moderation and administration for the Networth Matrimony platform.</p>

      <div className="card">
        <h2>Your access</h2>
        <p className="notice">
          Roles: {roles.length > 0 ? roles.join(', ') : 'none'}
        </p>
        <p className="notice">
          Every action you take is permission-checked by the API and, where it matters, written to the
          audit log. This console cannot do anything the API does not allow.
        </p>
      </div>

      <div className="card">
        <h2>Where to go</h2>
        <ul>
          <li>
            <Link href="/reports">Moderation queue</Link> - triage and resolve member reports.
          </li>
          <li>
            <Link href="/users">Members</Link> - look up an account by id or status.
          </li>
          <li>
            <Link href="/admins">Administrators</Link> - roles and MFA posture (requires{' '}
            <span className="mono">admin:manage</span>).
          </li>
        </ul>
      </div>
    </>
  );
}
