import Link from 'next/link';
import type { AdminUserDetailView, NetWorthCategoryOption } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { memberStatusLabel, memberStatusTone } from '@/lib/members';
import { CategoryForm, RestoreAccountForm, UnlockForm } from './member-forms';

/**
 * One member account, for the support conversation about it.
 *
 * The question this page answers is "why can this member not browse, or not be
 * found", so it leads with the three gates in the order the member meets them:
 * phone, identity, setup fee. A member who says they are verified but still
 * blocked is looking at the fee; one who has paid but is invisible is looking at
 * their profile's moderation state.
 *
 * It shows no profile content - not a name, a photograph or a birth date. The
 * profile card is moderation state only, which is why it can say APPROVED without
 * showing what was approved.
 */
export const dynamic = 'force-dynamic';

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let member: AdminUserDetailView | null = null;
  let error: string | null = null;
  try {
    member = await adminFetch<AdminUserDetailView>(`/admin/users/${encodeURIComponent(id)}`);
  } catch (caught) {
    error = describeError(caught);
  }

  // The bands are a public catalogue, so they are fetched from the same source the
  // app uses at registration: one list, not a second copy that can drift.
  let categories: NetWorthCategoryOption[] | null = null;
  try {
    categories = await adminFetch<NetWorthCategoryOption[]>('/master-data/net-worth-categories');
  } catch {
    categories = null;
  }

  const bandLabel =
    categories?.find((option) => option.key === member?.networthCategory)?.label ?? null;

  return (
    <>
      <p>
        <Link href="/users">&larr; Back to members</Link>
      </p>

      {error !== null ? <div className="error">{error}</div> : null}

      {member !== null ? (
        <>
          <h1>
            {member.mobile} <span className="mono">{member.id}</span>
          </h1>
          <p className="lede">
            <span className={`badge ${memberStatusTone(member.status)}`}>
              {memberStatusLabel(member.status)}
            </span>{' '}
            - registered {formatDateTime(member.createdAt)}
            {member.email === null ? ' - no email on file' : ` - ${member.email}`}
          </p>

          <div className="card">
            <h2>What gates this account</h2>
            <dl className="meta">
              <dt>Phone verified</dt>
              <dd>{member.isPhoneVerified ? 'Yes' : 'No'}</dd>
              <dt>Identity check</dt>
              <dd>
                {member.identityVerifiedAt === null
                  ? 'Not verified - cannot browse or be found'
                  : `Verified ${formatDateTime(member.identityVerifiedAt)}`}
              </dd>
              <dt>Setup fee</dt>
              <dd>
                {member.setupFeePaidAt === null
                  ? 'Unpaid - cannot browse or be found'
                  : `Paid ${formatDateTime(member.setupFeePaidAt)}`}
              </dd>
              <dt>Last sign-in</dt>
              <dd>{formatDateTime(member.lastLoginAt)}</dd>
              {member.deletedAt === null ? null : (
                <>
                  <dt>Deletion</dt>
                  <dd>Requested or applied {formatDateTime(member.deletedAt)}</dd>
                </>
              )}
            </dl>
          </div>

          {member.status === 'DELETED' || member.deletedAt !== null ? (
            <div className="card">
              <h2>Restore this account</h2>
              {member.isAnonymised ? (
                <p className="notice">
                  This account has been anonymised now that its retention window has passed, so its
                  personal data is gone and it cannot be restored.
                </p>
              ) : (
                <>
                  <p className="notice">
                    Deletion is reversible for a few months. Restoring brings the account and its
                    profile back, but not its access: verification, the setup fee and the profile
                    review all stand where they were.
                  </p>
                  <RestoreAccountForm memberId={member.id} />
                </>
              )}
            </div>
          ) : null}

          <div className="card">
            <h2>Profile</h2>
            {member.profile === null ? (
              <p className="notice">
                No profile yet, so there is nothing for discovery or for an unlock to point at.
              </p>
            ) : (
              <dl className="meta">
                <dt>Moderation</dt>
                <dd>{member.profile.status}</dd>
                <dt>Visibility</dt>
                <dd>{member.profile.visibility}</dd>
                <dt>Profile</dt>
                <dd className="mono">{member.profile.id}</dd>
              </dl>
            )}
          </div>

          <div className="card">
            <h2>Net-worth band</h2>
            <dl className="meta">
              <dt>Current band</dt>
              <dd>
                {bandLabel ?? 'Unknown band'}{' '}
                <span className="mono">({member.networthCategory})</span>
              </dd>
              <dt>Review note</dt>
              <dd>{member.categoryReviewNote ?? '-'}</dd>
              <dt>Last changed</dt>
              <dd>
                {member.categoryChangedAt === null
                  ? 'Never changed by an administrator'
                  : formatDateTime(member.categoryChangedAt)}
              </dd>
            </dl>
            {categories === null ? (
              <p className="notice">
                The band catalogue could not be loaded, so the change form is unavailable.
              </p>
            ) : (
              <CategoryForm
                memberId={member.id}
                current={member.networthCategory}
                options={categories}
              />
            )}
          </div>

          {member.profile === null ? null : (
            <div className="card">
              <h2>Manual authorisation</h2>
              <p className="notice">
                Records a 24-hour authorisation to disclose this profile&rsquo;s contact details
                with no payment, against your name and the reason you give. It creates no charge and
                no unlock record: those exist only against a verified payment.
              </p>
              <UnlockForm memberId={member.id} profileId={member.profile.id} />
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
