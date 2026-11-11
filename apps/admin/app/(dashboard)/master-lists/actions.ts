'use server';

import { revalidatePath } from 'next/cache';
import {
  AdminCreateMasterListValueSchema,
  AdminUpdateMasterListValueSchema,
  MasterListKeySchema,
  type AdminMasterListValueView,
} from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import type { AdminActionState } from '@/lib/admins';
import { describeError } from '@/lib/errors';

/**
 * The master-list mutations (`master_data:write`).
 *
 * Each action validates with the schema the API uses and reports the API's own
 * answer. The API remains the authority on the rules that depend on the data —
 * whether a list has sections, whether a sub-caste's religion exists, whether a
 * label is already taken — because those are questions this layer cannot answer
 * without the list.
 */

export async function createValueAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const key = MasterListKeySchema.safeParse(String(formData.get('key') ?? ''));
  if (!key.success) {
    return { error: 'Unknown list.' };
  }

  const group = String(formData.get('group') ?? '').trim();
  const parsed = AdminCreateMasterListValueSchema.safeParse({
    value: String(formData.get('value') ?? ''),
    ...(group.length === 0 ? {} : { group }),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return {
      error:
        field === 'group'
          ? 'Choose the section this value belongs to.'
          : 'Enter a value of 80 characters or fewer.',
    };
  }

  try {
    await adminFetch<AdminMasterListValueView>(
      `/admin/master-lists/${encodeURIComponent(key.data)}/values`,
      { method: 'POST', body: parsed.data },
    );
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/master-lists');
  return { error: null };
}

export async function updateValueAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const id = String(formData.get('id') ?? '');
  if (id.length === 0) {
    return { error: 'Missing value id.' };
  }

  const value = String(formData.get('value') ?? '').trim();
  const active = formData.get('is_active');
  const parsed = AdminUpdateMasterListValueSchema.safeParse({
    ...(value.length === 0 ? {} : { value }),
    ...(active === null ? {} : { is_active: String(active) === 'true' }),
  });
  if (!parsed.success) {
    return { error: 'Nothing to change: type a new value first.' };
  }

  try {
    await adminFetch<AdminMasterListValueView>(
      `/admin/master-lists/values/${encodeURIComponent(id)}`,
      { method: 'POST', body: parsed.data },
    );
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/master-lists');
  return { error: null };
}
