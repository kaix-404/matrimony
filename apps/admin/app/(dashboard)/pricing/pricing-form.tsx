'use client';

import { useState, type FormEvent } from 'react';
import {
  quotePayment,
  type NetWorthCategoryOption,
  type PricingQuote,
} from '@matrimony/shared';
import { useAdminAction } from '@/lib/use-admin-action';
import { publishPricingAction } from './actions';

/** Rupees as the API accepts them: digits with at most two decimals. */
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** A quote for the typed numbers, or null while they are incomplete or invalid. */
function quote(base: string, percent: string): PricingQuote | null {
  if (!AMOUNT_PATTERN.test(base.trim()) || percent.trim().length === 0) {
    return null;
  }
  try {
    return quotePayment(base.trim(), Number(percent));
  } catch {
    return null;
  }
}

/**
 * Publishes a new price version for one band (section 29).
 *
 * Pricing is append-only and takes effect the moment it is published, so the form
 * shows what the member actually pays - base plus GST - before the button is
 * pressed. The amount in force is quoted next to the field: a price change is a
 * decision made against the old number, not into an empty box.
 *
 * The note is optional but is what the audit log shows later, so the field says
 * so rather than looking like a leftover.
 */
export function PublishForm({
  options,
  inForce,
}: {
  options: NetWorthCategoryOption[];
  inForce: Record<string, string | undefined>;
}) {
  const [category, setCategory] = useState(options[0]?.key ?? '');
  const [baseAmount, setBaseAmount] = useState('');
  const [gstPercent, setGstPercent] = useState('18');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);

  const { state, pending, run } = useAdminAction(publishPricingAction, () => {
    setSaved(true);
    setBaseAmount('');
    setNote('');
  });

  const base = baseAmount.trim();
  const percent = gstPercent.trim();
  const baseValid = AMOUNT_PATTERN.test(base);
  const percentValid = percent.length > 0 && Number(percent) >= 0 && Number(percent) <= 100;
  const quoted = quote(baseAmount, gstPercent);
  const current = inForce[category];

  // Why the button is off, in the order the fields are filled in. A malformed
  // amount is the common case: "4,999" reads as fine to whoever typed it.
  const hint = !baseValid
    ? base.length === 0
      ? 'A member pays the base amount plus GST; fill both in to see the amount a checkout would charge.'
      : 'Enter the base amount as digits with up to two decimals, e.g. 4999 or 4999.00 - no commas.'
    : !percentValid
      ? 'Enter the GST rate as a percentage between 0 and 100.'
      : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaved(false);
    run({ category, baseAmount, gstPercent, note });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="pricing-category">Net-worth band</label>
      <select
        id="pricing-category"
        value={category}
        onChange={(event) => {
          setCategory(event.target.value);
          setSaved(false);
        }}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="notice">
        {current === undefined
          ? 'No price is in force for this band yet, so it cannot be bought. Publishing one turns it on.'
          : `In force now: ${current}`}
      </p>

      <label htmlFor="pricing-base">Base amount in rupees (GST excluded)</label>
      <input
        id="pricing-base"
        value={baseAmount}
        inputMode="decimal"
        placeholder="4999.00"
        onChange={(event) => {
          setBaseAmount(event.target.value);
          setSaved(false);
        }}
      />

      <label htmlFor="pricing-gst">GST percent</label>
      <input
        id="pricing-gst"
        value={gstPercent}
        inputMode="decimal"
        onChange={(event) => {
          setGstPercent(event.target.value);
          setSaved(false);
        }}
      />

      <label htmlFor="pricing-note">Note (shown in the audit log, optional)</label>
      <input
        id="pricing-note"
        value={note}
        maxLength={280}
        placeholder="Annual revision after CA review"
        onChange={(event) => setNote(event.target.value)}
      />

      {quoted === null ? (
        <p className="notice">{hint}</p>
      ) : (
        <dl className="meta">
          <dt>Member pays</dt>
          <dd className="mono">
            Rs {quoted.totalAmount} (Rs {quoted.baseAmount} + Rs {quoted.gstAmount} GST)
          </dd>
        </dl>
      )}

      {state.error !== null ? <div className="error">{state.error}</div> : null}
      {saved && state.error === null ? (
        <p className="notice">Published. It applies to the next checkout for this band.</p>
      ) : null}

      <div className="actions">
        <button className="btn" type="submit" disabled={pending || quoted === null || category === ''}>
          {pending ? 'Publishing...' : 'Publish version'}
        </button>
      </div>
    </form>
  );
}
