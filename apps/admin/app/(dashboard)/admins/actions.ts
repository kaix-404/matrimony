'use server';

import { revalidatePath } from 'next/cache';
import {
  AdminAssignRoleSchema,
  AdminCreateSchema,
  AdminRoleSlugSchema,
  AdminSetPhoneSchema,
  type AdminUserView,
} from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import type { AdminActionState } from '@/lib/admins';
import { describeError } from '@/lib/errors';

/**
 * The administrator-management mutations (`admin:manage`).
 *
 * Each one validates with the schema the API uses, so a short password, an
 * unknown role or a missing name is reported inline with the same wording the
 * API would answer with. The API stays the authority: it re-checks the payload,
 * and it — not this layer — refuses a role change or MFA reset aimed at the
 * caller's own account.
 */

function readId(formData: FormData): string {
  return String(formData.get('id') ?? '');
}

export async function createAdminAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const roles = formData.getAll('roles').map((value) => String(value));
  const phone = String(formData.get('phone') ?? '').trim();
  const parsed = AdminCreateSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    roles,
    // Absent rather than empty: an empty string is not a number, and the field is
    // optional so an administrator without SMS sign-in is still valid.
    ...(phone.length === 0 ? {} : { phone }),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'The new administrator was not valid.' };
  }

  try {
    await adminFetch<AdminUserView>('/admin/admins', { method: 'POST', body: parsed.data });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/admins');
  return { error: null };
}

export async function grantRoleAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const id = readId(formData);
  if (id.length === 0) {
    return { error: 'Missing administrator id.' };
  }

  const parsed = AdminAssignRoleSchema.safeParse({ role: String(formData.get('role') ?? '') });
  if (!parsed.success) {
    return { error: 'Choose a role to grant.' };
  }

  try {
    await adminFetch<AdminUserView>(`/admin/admins/${encodeURIComponent(id)}/roles`, {
      method: 'POST',
      body: parsed.data,
    });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/admins');
  return { error: null };
}

export async function revokeRoleAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const id = readId(formData);
  if (id.length === 0) {
    return { error: 'Missing administrator id.' };
  }

  const role = AdminRoleSlugSchema.safeParse(String(formData.get('role') ?? ''));
  if (!role.success) {
    return { error: 'Choose a role to revoke.' };
  }

  try {
    await adminFetch<AdminUserView>(
      `/admin/admins/${encodeURIComponent(id)}/roles/${encodeURIComponent(role.data)}`,
      { method: 'DELETE' },
    );
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/admins');
  return { error: null };
}

export async function resetMfaAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const id = readId(formData);
  if (id.length === 0) {
    return { error: 'Missing administrator id.' };
  }

  try {
    await adminFetch<AdminUserView>(`/admin/admins/${encodeURIComponent(id)}/mfa/reset`, {
      method: 'POST',
    });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/admins');
  return { error: null };
}

/**
 * Sets or clears an administrator's SMS sign-in number.
 *
 * An empty field clears it, which is the documented way back for a lost SIM. The
 * API validates the number itself and records the change in the audit log.
 */
export async function setPhoneAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const id = readId(formData);
  if (id.length === 0) {
    return { error: 'Missing administrator id.' };
  }

  const raw = String(formData.get('phone') ?? '').trim();
  const parsed = AdminSetPhoneSchema.safeParse({ phone: raw.length === 0 ? null : raw });
  if (!parsed.success) {
    return { error: 'Enter a 10-digit Indian mobile number, or leave it empty to clear it.' };
  }

  try {
    await adminFetch<AdminUserView>(`/admin/admins/${encodeURIComponent(id)}/phone`, {
      method: 'POST',
      body: parsed.data,
    });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/admins');
  return { error: null };
}
