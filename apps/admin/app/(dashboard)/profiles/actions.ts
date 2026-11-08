'use server';

import { revalidatePath } from 'next/cache';
import { AdminRejectProfileSchema } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import type { AdminActionState } from '@/lib/admins';
import { describeError } from '@/lib/errors';
import { rejectionReasonFrom } from '@/lib/profile-review';

/**
 * Approves one profile (section 26).
 *
 * Approval is what makes a profile discoverable at all — until it happens the
 * member exists but nobody can find them — so this action skips re-validation:
 * it carries nothing but an id, and the API is the authority on whether that id
 * is still awaiting review.
 *
 * Like the photo queue this does not redirect. A reviewer works down a list, and
 * a confirmation page between every item would only slow them down.
 */
export async function approveProfileAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const id = String(formData.get('id') ?? '');
  if (id.length === 0) {
    return { error: 'Missing profile id.' };
  }

  try {
    await adminFetch(`/admin/profiles/${id}/approve`, { method: 'POST' });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/profiles');
  return { error: null };
}

/**
 * Refuses one profile and records why (section 26).
 *
 * The reason is validated with the same schema the API uses, so "a rejection
 * needs a reason" appears as this page's own message instead of a raw 400. The
 * member reads this text verbatim in their own profile, which is why an empty
 * one is refused rather than stored as nothing.
 */
export async function rejectProfileAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const id = String(formData.get('id') ?? '');
  const reason = rejectionReasonFrom(String(formData.get('rejection_reason') ?? ''));

  if (id.length === 0) {
    return { error: 'Missing profile id.' };
  }
  if (reason === null) {
    return { error: 'Give a reason so the member knows what to change.' };
  }

  const parsed = AdminRejectProfileSchema.safeParse({ rejection_reason: reason });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'The reason was not valid.' };
  }

  try {
    await adminFetch(`/admin/profiles/${id}/reject`, { method: 'POST', body: parsed.data });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/profiles');
  return { error: null };
}
