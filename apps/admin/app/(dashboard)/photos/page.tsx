import Link from 'next/link';
import { PHOTO_STATUSES, type PhotoStatus } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import type { AdminPhotoList } from '@/lib/admin-types';
import { describeError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { PHOTO_STATUS_LABELS } from '@/lib/photos';
import { readParam } from '@/lib/query';
import { Pager } from '../pager';
import { ReviewControls } from './review-controls';

/**
 * The photo review queue (section 9).
 *
 * Nothing is visible to another member until a photo here is approved, so this
 * page is the gate on the whole visual half of the product. It is served oldest
 * first on purpose — see `AdminService.listPhotos` — because the member at the
 * back of a newest-first queue would wait forever.
 *
 * The thumbnail is a signed URL that expires in minutes, which is why the page is
 * `force-dynamic`: a cached render would serve links that no longer work.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Photo review - Networth Matrimony Admin' };

function asStatus(value: string | undefined): PhotoStatus {
  return value !== undefined && (PHOTO_STATUSES as readonly string[]).includes(value)
    ? (value as PhotoStatus)
    : 'PENDING_REVIEW';
}

export default async function PhotosPage({
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

  let list: AdminPhotoList | null = null;
  let error: string | null = null;
  try {
    list = await adminFetch<AdminPhotoList>(`/admin/photos?${query.toString()}`);
  } catch (caught) {
    error = describeError(caught);
  }

  return (
    <>
      <h1>Photo review</h1>
      <p className="lede">
        Photos waiting for a decision, oldest first. A member&rsquo;s photo is invisible to everyone
        else until it is approved here.
      </p>

      <div className="filters">
        {PHOTO_STATUSES.map((value) => (
          <Link
            key={value}
            href={`/photos?status=${value}`}
            className={value === status ? 'chip active' : 'chip'}
          >
            {PHOTO_STATUS_LABELS[value] ?? value}
          </Link>
        ))}
      </div>

      {error !== null ? <div className="error">{error}</div> : null}

      {list !== null ? (
        <div className="card">
          {list.photos.length === 0 ? (
            <p className="notice">
              {status === 'PENDING_REVIEW'
                ? 'Nothing is waiting for review.'
                : 'No photos have this status.'}
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gap: 24,
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              }}
            >
              {list.photos.map((photo) => (
                <div key={photo.id} style={{ display: 'grid', gap: 8 }}>
                  {/* A plain img, not next/image: the URL is a presigned S3 link
                      that expires in minutes and that the Next optimiser would
                      happily cache as if it were stable. */}
                  <img
                    src={photo.url}
                    alt={`Photo ${photo.photo_type.toLowerCase()} for ${photo.profile_name ?? 'a member'}`}
                    style={{
                      width: '100%',
                      aspectRatio: '3 / 4',
                      objectFit: 'cover',
                      borderRadius: 12,
                      background: 'var(--surface, #f4f4f6)',
                    }}
                  />
                  <div>
                    <strong>{photo.profile_name ?? 'Deleted profile'}</strong>
                    <div className="mono" style={{ color: 'var(--muted)' }}>
                      {photo.profile_id} · {photo.photo_type.toLowerCase()}
                    </div>
                    <div className="mono" style={{ color: 'var(--muted)' }}>
                      uploaded {formatDateTime(photo.uploaded_at)}
                    </div>
                    {photo.reviewed_at !== null ? (
                      <div className="mono" style={{ color: 'var(--muted)' }}>
                        reviewed {formatDateTime(photo.reviewed_at)}
                      </div>
                    ) : null}
                    {photo.rejection_reason !== null ? <div>{photo.rejection_reason}</div> : null}
                  </div>
                  <ReviewControls photoId={photo.id} />
                </div>
              ))}
            </div>
          )}
          <Pager path="/photos" nextCursor={list.nextCursor} cursor={cursor} filters={{ status }} />
        </div>
      ) : null}
    </>
  );
}
