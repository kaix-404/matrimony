import Link from 'next/link';
import { ADMIN_VERIFICATION_STATUSES, type AdminVerificationStatus } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import type { AdminVerificationList } from '@/lib/admin-types';
import { describeError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { readParam } from '@/lib/query';
import { Pager } from '../pager';
import { VerificationStatusBadge } from './status-badge';

/**
 * Identity checks (D9), the support read surface.
 *
 * The question this page answers is the one a member phones in with: "is my
 * check done, and if it failed, why?" So the table leads with the mobile number
 * — the handle support actually has — and puts the failure reason next to the
 * status instead of behind a detail page, because the reason is the answer.
 *
 * It shows state, never evidence. The Aadhaar name, the supplier reference and
 * the screening payload are not part of `AdminVerificationView`; the four masked
 * digits are, only because they are how a member identifies the check.
 *
 * `force-dynamic` for the same reason as the moderation queue: a verdict lands
 * by webhook the moment the member finishes in DigiLocker, so a cached page
 * would keep claiming "awaiting member" after it passed.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Identity checks - Networth Matrimony Admin' };

/** Labels for the filter chips. `PENDING` names who is being waited on. */
const FILTER_LABELS: Record<AdminVerificationStatus, string> = {
  PENDING: 'Awaiting member',
  VERIFIED: 'Verified',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
};

function asStatus(value: string | undefined): AdminVerificationStatus | undefined {
  return value !== undefined && (ADMIN_VERIFICATION_STATUSES as readonly string[]).includes(value)
    ? (value as AdminVerificationStatus)
    : undefined;
}

export default async function VerificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = asStatus(readParam(params, 'status'));
  const cursor = readParam(params, 'cursor');

  const query = new URLSearchParams();
  if (status !== undefined) {
    query.set('status', status);
  }
  if (cursor !== undefined) {
    query.set('cursor', cursor);
  }
  const suffix = query.toString();

  let list: AdminVerificationList | null = null;
  let error: string | null = null;
  try {
    list = await adminFetch<AdminVerificationList>(
      suffix.length > 0 ? `/admin/verifications?${suffix}` : '/admin/verifications',
    );
  } catch (caught) {
    error = describeError(caught);
  }

  const filters: Array<{ value: AdminVerificationStatus | null; label: string }> = [
    { value: null, label: 'All' },
    ...ADMIN_VERIFICATION_STATUSES.map((value) => ({ value, label: FILTER_LABELS[value] })),
  ];

  return (
    <>
      <h1>Identity checks</h1>
      <p className="lede">
        Aadhaar checks through DigiLocker, newest first. A check passes only when the supplier
        confirms it by webhook; nothing here can be set by hand.
      </p>

      <div className="filters">
        {filters.map((filter) => {
          const active = filter.value === status || (filter.value === null && status === undefined);
          const href =
            filter.value === null ? '/verifications' : `/verifications?status=${filter.value}`;
          return (
            <Link key={filter.label} href={href} className={active ? 'chip active' : 'chip'}>
              {filter.label}
            </Link>
          );
        })}
      </div>

      {error !== null ? <div className="error">{error}</div> : null}

      {list !== null ? (
        <div className="card">
          {list.verifications.length === 0 ? (
            <p className="notice">
              {status === undefined
                ? 'No member has started an identity check yet.'
                : 'No identity check matches this filter.'}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Status</th>
                  <th>Failure reason</th>
                  <th>Consent given</th>
                  <th>Started</th>
                  <th>Verified</th>
                </tr>
              </thead>
              <tbody>
                {list.verifications.map((check) => (
                  <tr key={check.id}>
                    <td>
                      <div className="mono">{check.memberMobile}</div>
                      <div className="mono" style={{ color: 'var(--muted)' }}>
                        {check.userId}
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                        {check.memberStatus}
                        {check.aadhaarLast4 !== null ? ` · Aadhaar xxxx${check.aadhaarLast4}` : ''}
                      </div>
                    </td>
                    <td>
                      <VerificationStatusBadge status={check.status} />
                      <div className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>
                        {check.provider}
                        {check.vendor !== null ? ` / ${check.vendor}` : ''}
                      </div>
                    </td>
                    <td>
                      {check.failureReason ?? check.failureCode ?? (
                        <span style={{ color: 'var(--muted)' }}>-</span>
                      )}
                    </td>
                    <td>
                      {check.consentedAt === null ? (
                        <span style={{ color: 'var(--muted)' }}>not recorded</span>
                      ) : (
                        formatDateTime(check.consentedAt)
                      )}
                    </td>
                    <td>{formatDateTime(check.createdAt)}</td>
                    <td>{check.verifiedAt === null ? '-' : formatDateTime(check.verifiedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pager
            path="/verifications"
            nextCursor={list.nextCursor}
            status={status}
            cursor={cursor}
          />
        </div>
      ) : null}
    </>
  );
}
