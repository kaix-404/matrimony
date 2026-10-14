import { adminFetch } from '@/lib/api';
import type { AdminUserList } from '@/lib/admin-types';
import { describeError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Members - Networth Matrimony Admin' };

/**
 * The member account list (section 24 read surface).
 *
 * It shows account ids, contact and lifecycle status only. It does not show a
 * profile, a name or a photograph: those are a separate, permission-checked read
 * (section 13), and this list deliberately cannot become a side door to them.
 */
export default async function UsersPage() {
  let list: AdminUserList | null = null;
  let error: string | null = null;
  try {
    list = await adminFetch<AdminUserList>('/admin/users');
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <h1>Members</h1>
      <p className="lede">Member accounts, newest first.</p>

      {error !== null ? <div className="error">{error}</div> : null}

      {list !== null ? (
        <div className="card">
          {list.users.length === 0 ? (
            <p className="notice">No member accounts.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Mobile</th>
                  <th>Status</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {list.users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div>{user.email}</div>
                      <div className="mono" style={{ color: 'var(--muted)' }}>
                        {user.id}
                      </div>
                    </td>
                    <td className="mono">{user.mobile}</td>
                    <td>
                      <span className="badge badge-closed">{user.status}</span>
                    </td>
                    <td>{formatDateTime(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {list.hasMore ? (
            <p className="notice">More accounts exist than are shown here.</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
