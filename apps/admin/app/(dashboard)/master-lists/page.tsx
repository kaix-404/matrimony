import type { AdminMasterListsResponse } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { MasterListsEditor } from './master-lists-editor';

/**
 * The lists members pick from — education, occupation, religion, sub-caste,
 * mother tongue, state and community (client decision D3).
 *
 * This page exists because those values are the client's to maintain, not ours:
 * the community list has no values at all yet because they have not sent one, and
 * state names they consider wrong are their spelling to correct. Both were
 * previously only fixable by editing the seed and redeploying, which made a
 * missing picker option look like a bug in the app.
 *
 * Loaded fresh on every request: an administrator who retires a value must not be
 * shown a cached page that still lists it as offered.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Master lists - Networth Matrimony Admin' };

export default async function MasterListsPage() {
  let response: AdminMasterListsResponse | null = null;
  let error: string | null = null;
  try {
    response = await adminFetch<AdminMasterListsResponse>('/admin/master-lists');
  } catch (caught) {
    error = describeError(caught);
  }

  const totalValues =
    response === null ? 0 : response.lists.reduce((sum, list) => sum + list.values.length, 0);

  return (
    <>
      <h1>Master lists</h1>
      <p className="lede">
        What members choose from in their profile and partner preferences. Changes take effect for
        the next person who opens a picker, with no app release.
      </p>

      {error !== null ? <div className="error">{error}</div> : null}

      {response === null ? null : response.lists.length === 0 ? (
        <p className="notice">No master list has been seeded, so there is nothing to maintain.</p>
      ) : (
        <>
          <p className="notice">
            {response.lists.length} lists, {totalValues} values. Retired values are kept out of the
            pickers but remain on the profiles that chose them.
          </p>
          <MasterListsEditor lists={response.lists} />
        </>
      )}
    </>
  );
}
