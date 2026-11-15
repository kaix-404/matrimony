'use server';

import { revalidatePath } from 'next/cache';
import { AdminProfileUpdateSchema, type AdminProfileDetail } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import type { AdminActionState } from '@/lib/admins';
import { describeError } from '@/lib/errors';

/**
 * Saves a profile correction made in the console.
 *
 * The payload arrives as one JSON field rather than forty form fields: the form
 * only sends what actually changed, and building that set is the form's job. The
 * API validates it again with the same schema (`AdminProfileUpdateSchema`), so a
 * hand-crafted request cannot skip a rule the screen enforces.
 *
 * A reason is required: `profile:update` is a sensitive permission and the API
 * writes an audit row from it, which is worthless without an explanation.
 */
export async function updateProfileAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const id = String(formData.get('id') ?? '');
  if (id.length === 0) {
    return { error: 'Missing member id.' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get('payload') ?? '{}'));
  } catch {
    return { error: 'The form could not be read. Reload the page and try again.' };
  }

  const parsed = AdminProfileUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return {
      error:
        field === 'reason'
          ? 'Give a reason for the correction (up to 500 characters).'
          : field === 'about_me'
            ? 'About me must be at least 50 characters (or left empty).'
            : `Check “${String(field ?? 'the form')}”: ${issue?.message ?? 'invalid value'}.`,
    };
  }

  try {
    await adminFetch<AdminProfileDetail>(`/admin/users/${encodeURIComponent(id)}/profile`, {
      method: 'PATCH',
      body: parsed.data,
    });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath(`/users/${id}`);
  revalidatePath(`/users/${id}/profile`);
  return { error: null };
}
