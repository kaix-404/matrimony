'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { AdminResolveDataRequestSchema } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import { buildResolvePayload, type ResolveState } from '@/lib/data-requests';
import { describeError } from '@/lib/errors';

/**
 * Resolves a data-subject request (sections 21 and 32).
 *
 * The submitted status and notes are validated with the same schema the API
 * uses, so a refusal with no explanation is caught here and shown inline rather
 * than surfacing as a raw 400. The API remains the authority and re-checks
 * everything, including that the request is still open.
 */
export async function resolveDataRequestAction(
  _previous: ResolveState,
  formData: FormData,
): Promise<ResolveState> {
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  const notes = String(formData.get('notes') ?? '');

  if (id.length === 0) {
    return { error: 'Missing request id.' };
  }

  if (status !== 'COMPLETED' && status !== 'REJECTED') {
    return { error: 'Choose whether the request was completed or rejected.' };
  }

  const parsed = AdminResolveDataRequestSchema.safeParse(buildResolvePayload(status, notes));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'The resolution was not valid.' };
  }

  try {
    await adminFetch(`/admin/data-requests/${id}/resolve`, {
      method: 'POST',
      body: parsed.data,
    });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/data-requests');
  revalidatePath(`/data-requests/${id}`);
  redirect(`/data-requests/${id}?resolved=1`);
}
