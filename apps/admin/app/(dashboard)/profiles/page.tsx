import Link from 'next/link';
import { adminFetch } from '@/lib/api';
import type { AdminProfileList } from '@/lib/admin-types';
import { describeError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import {
  PROFILE_REVIEW_STATUSES,
  PROFILE_STATUS_LABELS,
  type ProfileReviewStatus,
} from '@/lib/profile-review';
import { readParam } from '@/lib/query';
import { Pager } from '../pager';
import { ProfileReviewControls } from './review-controls';

/**
 * The profile review queue (section 26).
 *
 * A member can edit their profile and submit it as often as they like, but
 * nothing they write is discoverable until it is approved here. This page is
 * therefore the gate on the member half of the product, not a report about it.
 *
 * The photo is a signed URL that expires in minutes, so the page is
 * `force-dynamic`: a cached render would serve links that no longer work.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Profile review - Networth Matrimony Admin' };

function asStatus(value: string | undefined): ProfileReviewStatus {
  return value !== undefined && (PROFILE_REVIEW_STATUSES as readonly string[]).includes(value)
    ? (value as ProfileReviewStatus)
    : 'PENDING_REVIEW';
}

export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = asStatus(readParam(params, 'status'));
  const cursor = readParam(params, 'cursor');

  const query = new URLSearchParams({ status });
  if (cursor !== undefined) {
    query.set('cursor', cursor);
  }

  let list: AdminProfileList | null = null;
  let error: string | null = null;
  try {
    list = await adminFetch<AdminProfileList>(`/admin/profiles?${query.toString()}`);
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <h1>Profile review</h1>
      <p className="lede">
        Profiles submitted by members, oldest first. Until a profile is approved here, nobody else
        can find that member at all.
      </p>

      <div className="filters">
        {PROFILE_REVIEW_STATUSES.map((value) => (
          <Link
            key={value}
            href={`/profiles?status=${value}`}
            className={value === status ? 'chip active' : 'chip'}
          >
            {PROFILE_STATUS_LABELS[value]}
          </Link>
        ))}
      </div>

      {error !== null ? <div className="error">{error}</div> : null}

      {list !== null ? (
        <div className="card">
          {list.profiles.length === 0 ? (
            <p className="notice">
              {status === 'PENDING_REVIEW'
                ? 'Nothing is waiting for review.'
                : 'No profiles have this status.'}
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gap: 24,
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              }}
            >
              {list.profiles.map((profile) => (
                <div key={profile.id} style={{ display: 'grid', gap: 8 }}>
                  {profile.photo_url !== null ? (
                    /* A plain img, not next/image: the URL is a presigned S3 link
                       that expires in minutes and that the Next optimiser would
                       happily cache as if it were stable. */
                    <img
                      src={profile.photo_url}
                      alt={`Photo of ${profile.name}`}
                      style={{
                        width: '100%',
                        aspectRatio: '3 / 4',
                        objectFit: 'cover',
                        borderRadius: 12,
                        background: 'var(--surface, #f4f4f6)',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: '3 / 4',
                        borderRadius: 12,
                        background: 'var(--surface, #f4f4f6)',
                        display: 'grid',
                        placeItems: 'center',
                        color: 'var(--muted)',
                      }}
                    >
                      No photo
                    </div>
                  )}
                  <div>
                    <strong>{profile.name}</strong>
                    <div style={{ color: 'var(--muted)' }}>
                      {[profile.city, profile.age === null ? null : `${profile.age}`]
                        .filter((part) => part !== null)
                        .join(' · ')}
                    </div>
                    <div className="mono" style={{ color: 'var(--muted)' }}>
                      submitted {formatDateTime(profile.submitted_at)}
                    </div>
                    {profile.reviewed_at !== null ? (
                      <div className="mono" style={{ color: 'var(--muted)' }}>
                        reviewed {formatDateTime(profile.reviewed_at)}
                      </div>
                    ) : null}
                    {profile.rejection_reason !== null ? (
                      <div>{profile.rejection_reason}</div>
                    ) : null}
                  </div>
                  <ProfileReviewControls profileId={profile.id} status={profile.status} />
                </div>
              ))}
            </div>
          )}
          <Pager
            path="/profiles"
            nextCursor={list.nextCursor}
            cursor={cursor}
            filters={{ status }}
          />
        </div>
      ) : null}
    </>
  );
}
