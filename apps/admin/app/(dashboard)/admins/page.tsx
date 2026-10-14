import type { AdminRoleView } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import type { AdminAdminList } from '@/lib/admin-types';
import { describeError, isSessionExpired, ApiError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Administrators - Networth Matrimony Admin' };

/**
 * The administrator and role catalogue (section 24 / 33).
 *
 * Both reads require `admin:manage`, so an operator without it sees an
 * explanatory message rather than an empty page that looks broken. The role
 * cards show the permissions each role grants as the API reports them, which is
 * the actual grant set, not the code catalogue.
 */
export default async function AdminsPage() {
  let admins: AdminAdminList | null = null;
  let roles: AdminRoleView[] | null = null;
  let error: string | null = null;

  try {
    admins = await adminFetch<AdminAdminList>('/admin/admins');
    roles = await adminFetch<AdminRoleView[]>('/admin/roles');
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 403) {
      error = 'You do not hold admin:manage, so the administrator list is not available to you.';
    } else if (isSessionExpired(caught)) {
      error = 'Your session has expired. Sign in again.';
    } else {
      error = describeError(caught);
    }
  }

  return (
    <>
      <h1>Administrators</h1>
      <p className="lede">Administrator accounts, their roles, and each role&rsquo;s permissions.</p>

      {error !== null ? <div className="error">{error}</div> : null}

      {admins !== null ? (
        <div className="card">
          <h2>Accounts</h2>
          {admins.admins.length === 0 ? (
            <p className="notice">No administrators.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Roles</th>
                  <th>MFA</th>
                  <th>Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {admins.admins.map((admin) => (
                  <tr key={admin.id}>
                    <td>
                      <div>{admin.name}</div>
                      <div className="mono" style={{ color: 'var(--muted)' }}>
                        {admin.email}
                      </div>
                    </td>
                    <td>{admin.roles.join(', ') || '-'}</td>
                    <td>
                      <span className={admin.mfaEnabled ? 'badge badge-ok' : 'badge badge-open'}>
                        {admin.mfaEnabled ? 'Enrolled' : 'Not enrolled'}
                      </span>
                    </td>
                    <td>{formatDateTime(admin.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {roles !== null ? (
        <div className="card">
          <h2>Roles</h2>
          {roles.map((role) => (
            <div key={role.id} style={{ marginBottom: 14 }}>
              <div>
                <strong>{role.name}</strong> <span className="mono">({role.slug})</span>
              </div>
              {role.description !== null ? <p className="notice">{role.description}</p> : null}
              <p className="notice">
                {role.permissions.length > 0
                  ? role.permissions.map((permission) => permission.key).join(', ')
                  : 'No permissions'}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
