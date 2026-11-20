'use server';

import { revalidatePath } from 'next/cache';
import { AdminReviewVerificationSchema } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import type { AdminActionState } from '@/lib/admins';
import { describeError } from '@/lib/errors';

/**
 * Approves or rejects a manually uploaded identity document (the D9 fallback).
 *
 * Validated with the same schema the API uses, so "a rejection needs a reason"
 * comes back as the console's own message instead of a raw 400. The API re-checks
 * and remains the authority — and it refuses anything that is not a manual check,
 * so this cannot be used to hand-verify a DigiLocker row.
 *
 * Like the photo queue this does not redirect: the administrator stays on the
 * list, which refreshes in place.
 */
export async function reviewVerificationAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const id = String(formData.get('id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const note = String(formData.get('note') ?? '').trim();

  if (id.length === 0) {
    return { error: 'Missing identity check id.' };
  }
  if (decision !== 'APPROVE' && decision !== 'REJECT') {
    return { error: 'Choose whether to approve or reject the document.' };
  }

  // The note is omitted rather than sent empty on an approval: the contract
  // refuses an approval that carries one at all, so a stale field must not be
  // stored as a complaint about a check that passed.
  const payload =
    decision === 'APPROVE' ? { decision } : note.length > 0 ? { decision, note } : { decision };

  const parsed = AdminReviewVerificationSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'The decision was not valid.' };
  }

  try {
    await adminFetch(`/admin/verifications/${id}/review`, {
      method: 'POST',
      body: parsed.data,
    });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/verifications');
  return { error: null };
}
