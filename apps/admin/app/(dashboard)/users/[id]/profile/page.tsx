import Link from 'next/link';
import type { AdminProfileDetail } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { PROFILE_READ_ROWS, displayValue } from '@/lib/profile-fields';
import { ProfileEditForm } from './profile-form';

/**
 * One member's profile, in full.
 *
 * The member view (`/users/[id]`) answers "why can this person not browse" and
 * deliberately carries no profile content; this page is the other half, behind
 * its own `profile:read` grant, for the support call that starts with "my city is
 * wrong" or "my star sign is wrong".
 *
 * Everything is shown before anything can be edited: an administrator correcting
 * a field should be looking at the profile it belongs to, not at a form that only
 * shows the editable subset.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Member profile - Networth Matrimony Admin' };

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let profile: AdminProfileDetail | null = null;
  let error: string | null = null;
  try {
    profile = await adminFetch<AdminProfileDetail>(
      `/admin/users/${encodeURIComponent(id)}/profile`,
    );
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <p>
        <Link href={`/users/${id}`}>&larr; Back to the member</Link>
      </p>

      <h1>Profile</h1>

      {error !== null ? <div className="error">{error}</div> : null}

      {profile !== null ? (
        <>
          <p className="lede">
            {profile.first_name} {profile.last_name ?? ''} · {profile.status} ·{' '}
            {profile.date_of_birth}
          </p>

          <dl>
            {PROFILE_READ_ROWS.map((row) => (
              <div key={row.key}>
                <dt>{row.label}</dt>
                <dd>{displayValue(profile[row.key])}</dd>
              </div>
            ))}
          </dl>

          <h2>Correct this profile</h2>
          <p className="lede">
            Every change is written to the audit log with the reason you give, and the profile stays
            in its current moderation state — editing is not a review decision. Gender, education,
            profession and community are not editable here: gender is identity, and the rest are
            master-list values with their own admin screens.
          </p>
          <ProfileEditForm profile={profile} />
        </>
      ) : null}
    </>
  );
}
