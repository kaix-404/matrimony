'use server';

import { revalidatePath } from 'next/cache';
import { AdminPublishPricingSchema, type AdminPricingView } from '@matrimony/shared';
import { adminFetch } from '@/lib/api';
import type { AdminActionState } from '@/lib/admins';
import { describeError } from '@/lib/errors';

/**
 * Publishes a new pricing version for one band (section 29).
 *
 * `pricing:write` is a Super Admin permission, so a finance administrator who
 * only holds `pricing:read` sees the price and the history but gets the API's 403
 * when they try to change it - the console reports that rather than hiding the
 * form, because the permission is the API's to decide.
 *
 * The amount is validated here with the API's own schema, which is stricter than
 * the input element: it accepts rupees with at most two decimals, so a stray
 * "4,999" is refused before the request instead of after it.
 */
export async function publishPricingAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const rawBase = String(formData.get('baseAmount') ?? '').trim();
  const rawPercent = String(formData.get('gstPercent') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  const parsed = AdminPublishPricingSchema.safeParse({
    category: String(formData.get('category') ?? ''),
    baseAmount: rawBase,
    gstPercent: rawPercent.length === 0 ? Number.NaN : Number(rawPercent),
    ...(note.length === 0 ? {} : { note }),
  });

  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const messages: Record<string, string> = {
      category: 'Choose the band this price is for.',
      baseAmount: 'Enter the base amount in rupees, e.g. 4999 or 4999.00 (no commas).',
      gstPercent: 'Enter the GST rate as a percentage between 0 and 100.',
      note: 'Keep the note under 280 characters.',
    };
    return { error: messages[String(field)] ?? 'The price was not valid.' };
  }

  try {
    await adminFetch<AdminPricingView>('/admin/pricing', {
      method: 'POST',
      body: parsed.data,
    });
  } catch (caught) {
    return { error: describeError(caught) };
  }

  revalidatePath('/pricing');
  return { error: null };
}
