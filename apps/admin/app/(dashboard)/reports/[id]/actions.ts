'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { AdminReviewReportSchema, type ReportActionType } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { buildReviewPayload, type ReviewState } from '@/lib/reports';

/**
 * Resolves a report (section 30).
 *
 * The submitted action and notes are turned into the API payload and validated
 * with the same schema the API uses, so an invalid combination - a sanction with
 * no notes, or an action that disagrees with its status - is caught here and
 * shown inline rather than surfacing as a raw 400. The API remains the authority
 * and re-checks everything.
 */
export async function reviewReportAction(
  _previous: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const id = String(formData.get('id') ?? '');
  const action = String(formData.get('action') ?? '') as ReportActionType;
  const notes = String(formData.get('notes') ?? '');

  if (id.length === 0) {
    return { error: 'Missing report id.' };
  }

  const parsed = AdminReviewReportSchema.safeParse(buildReviewPayload(action, notes));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'The review was not valid.' };
  }

  try {
    await adminFetch(`/admin/reports/${id}/review`, { method: 'POST', body: parsed.data });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/reports');
  revalidatePath(`/reports/${id}`);
  redirect(`/reports/${id}?resolved=1`);
}
