'use server';

import { revalidatePath } from 'next/cache';
import { AdminReviewPhotoSchema } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import type { AdminActionState } from '@/lib/admins';
import { describeError } from '@/lib/errors';
import { buildPhotoReviewPayload } from '@/lib/photos';

/**
 * Approves or rejects one photo (section 9).
 *
 * Validated with the same schema the API uses, so "a rejection needs a reason"
 * comes back as the console's own field message instead of a raw 400. The API
 * re-checks and remains the authority.
 *
 * Unlike the report review this does not redirect: the queue page stays open and
 * refreshes, because an administrator working through photos needs the next one
 * in front of them, not a confirmation page.
 */
export async function reviewPhotoAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const id = String(formData.get('id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const rejectionReason = String(formData.get('rejection_reason') ?? '');

  if (id.length === 0) {
    return { error: 'Missing photo id.' };
  }
  if (decision !== 'APPROVE' && decision !== 'REJECT') {
    return { error: 'Choose whether to approve or reject the photo.' };
  }

  const parsed = AdminReviewPhotoSchema.safeParse(
    buildPhotoReviewPayload(decision, rejectionReason),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'The decision was not valid.' };
  }

  try {
    await adminFetch(`/admin/photos/${id}/review`, { method: 'POST', body: parsed.data });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/photos');
  return { error: null };
}
