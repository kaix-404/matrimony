'use server';

import { revalidatePath } from 'next/cache';
import {
  AdminChangeCategorySchema,
  AdminGrantUnlockSchema,
  AdminRestoreUserSchema,
  type AdminCategoryChangeView,
  type AdminGrantUnlockView,
  type AdminRestoreUserView,
} from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import type { AdminActionState } from '@/lib/admins';
import { describeError } from '@/lib/errors';

/**
 * The two member mutations support and finance actually reach for.
 *
 * Both are audited by the API with a mandatory reason, and both are separate
 * permissions from reading the account: `user:read` does not grant either. A
 * caller without the grant gets the API's 403, shown inline - the dashboard does
 * not decide permissions, it reports them.
 */

export async function changeCategoryAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const id = String(formData.get('id') ?? '');
  if (id.length === 0) {
    return { error: 'Missing member id.' };
  }

  const parsed = AdminChangeCategorySchema.safeParse({
    category: String(formData.get('category') ?? ''),
    reason: String(formData.get('reason') ?? ''),
  });
  if (!parsed.success) {
    // The schema's own words are for the API; a support agent needs to know which
    // field to fill in.
    const field = parsed.error.issues[0]?.path[0];
    return {
      error:
        field === 'reason'
          ? 'Give a reason for the change (up to 500 characters).'
          : 'Choose the band to move this member to.',
    };
  }

  try {
    await adminFetch<AdminCategoryChangeView>(`/admin/users/${encodeURIComponent(id)}/category`, {
      method: 'POST',
      body: parsed.data,
    });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/users');
  revalidatePath(`/users/${id}`);
  return { error: null };
}

/**
 * F6: undo a deletion while the account is still restorable.
 *
 * The API refuses this once the retention pass has anonymised the row, and that
 * refusal is shown as-is rather than pre-empted here: the console reports what
 * the backend decided, it does not hold a second copy of the rule.
 */
export async function restoreAccountAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const id = String(formData.get('id') ?? '');
  if (id.length === 0) {
    return { error: 'Missing member id.' };
  }

  const parsed = AdminRestoreUserSchema.safeParse({
    reason: String(formData.get('reason') ?? ''),
  });
  if (!parsed.success) {
    return { error: 'Give a reason for restoring this account (up to 500 characters).' };
  }

  try {
    await adminFetch<AdminRestoreUserView>(`/admin/users/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: parsed.data,
    });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/users');
  revalidatePath(`/users/${id}`);
  return { error: null };
}

export async function grantUnlockAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = AdminGrantUnlockSchema.safeParse({
    profileId: String(formData.get('profileId') ?? ''),
    reason: String(formData.get('reason') ?? ''),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return {
      error:
        field === 'reason'
          ? 'Give a reason for this authorisation (up to 500 characters).'
          : 'This member has no profile to authorise.',
    };
  }

  const memberId = String(formData.get('id') ?? '');

  try {
    await adminFetch<AdminGrantUnlockView>('/admin/unlocks', {
      method: 'POST',
      body: parsed.data,
    });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/users');
  if (memberId.length > 0) {
    revalidatePath(`/users/${memberId}`);
  }
  return { error: null };
}
