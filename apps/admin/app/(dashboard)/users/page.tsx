import Link from 'next/link';
import { adminFetch } from '@/lib/api';
import type { AdminUserList } from '@/lib/admin-types';
import { describeError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import {
  ADMIN_USER_STATUS_FILTERS,
  ADMIN_USER_STATUS_LABELS,
  isAdminUserStatus,
  memberStatusLabel,
  memberStatusTone,
} from '@/lib/members';
import { readParam } from '@/lib/query';
import { Pager } from '../pager';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Members - Networth Matrimony Admin' };

/** Builds the query string the list and the pager both use. */
function toQuery(params: { status?: string; q?: string; cursor?: string }): string {
  const search = new URLSearchParams();
  if (params.status !== undefined) {
    search.set('status', params.status);
  }
  if (params.q !== undefined) {
    search.set('q', params.q);
  }
  if (params.cursor !== undefined) {
    search.set('cursor', params.cursor);
  }
  return search.toString();
}

/**
 * The member account list (section 24 read surface), with the lookup support
 * actually needs.
 *
 * A member phones in with a mobile number and a question about why they cannot
 * browse, so the page can be narrowed by that number (or by email) and by
 * lifecycle state. Search matches contact details only, never a name: names live
 * on the profile, which is a separate permission-checked read, and this list
 * cannot become a side door to it.
 *
 * The form is a plain GET form so the search survives a reload, can be linked,
 * and works before any JavaScript has loaded.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawStatus = readParam(params, 'status');
  const status = isAdminUserStatus(rawStatus) ? rawStatus : undefined;
  const q = readParam(params, 'q');
  const cursor = readParam(params, 'cursor');

  const suffix = toQuery({ status, q: q?.trim(), cursor });

  let list: AdminUserList | null = null;
  let error: string | null = null;
  try {
    list = await adminFetch<AdminUserList>(suffix.length > 0 ? `/admin/users?${suffix}` : '/admin/users');
  } catch (caught) {
    error = describeError(caught);
  }

  const filtered = status !== undefined || (q !== undefined && q.trim().length > 0);
  const chips: Array<{ value: string | undefined; label: string }> = [
    { value: undefined, label: 'All' },
    ...ADMIN_USER_STATUS_FILTERS.map((value) => ({
      value,
      label: ADMIN_USER_STATUS_LABELS[value],
    })),
  ];

  return (
    <>
      <h1>Members</h1>
      <p className="lede">
        Member accounts, newest first. Search by mobile number or email; the list never shows a
        name, a photograph or a profile.
      </p>

      <form method="get" action="/users" className="actions">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Mobile number or email"
          aria-label="Search members by mobile number or email"
        />
        {status !== undefined ? <input type="hidden" name="status" value={status} /> : null}
        <button className="btn" type="submit">
          Search
        </button>
        {filtered ? (
          <Link className="btn-link" href="/users">
            Clear
          </Link>
        ) : null}
      </form>

      <div className="filters">
        {chips.map((chip) => {
          const active = chip.value === status;
          const href = chip.value === undefined
            ? `/users${q ? `?${toQuery({ q: q.trim() })}` : ''}`
            : `/users?${toQuery({ status: chip.value, q: q?.trim() })}`;
          return (
            <Link key={chip.label} href={href} className={active ? 'chip active' : 'chip'}>
              {chip.label}
            </Link>
          );
        })}
      </div>

      {error !== null ? <div className="error">{error}</div> : null}

      {list !== null ? (
        <div className="card">
          {list.users.length === 0 ? (
            <p className="notice">
              {filtered
                ? 'No account matches that search. Check the digits, or clear the filters.'
                : 'No member accounts.'}
            </p>
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
                      <div>
                        {user.email ?? (
                          <span style={{ color: 'var(--muted)' }}>no email on file</span>
                        )}
                      </div>
                      <div className="mono" style={{ color: 'var(--muted)' }}>
                        {user.id}
                      </div>
                    </td>
                    <td className="mono">{user.mobile}</td>
                    <td>
                      <span className={`badge ${memberStatusTone(user.status)}`}>
                        {memberStatusLabel(user.status)}
                      </span>
                    </td>
                    <td>{formatDateTime(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pager
            path="/users"
            nextCursor={list.nextCursor}
            cursor={cursor}
            filters={{ status, q: q?.trim() }}
          />
        </div>
      ) : null}
    </>
  );
}
