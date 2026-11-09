'use client';

import { useState, type FormEvent } from 'react';
import type { NetWorthCategoryOption } from '@matrimony/shared';
import { useAdminAction } from '@/lib/use-admin-action';
import { changeCategoryAction, grantUnlockAction, restoreAccountAction } from './actions';

/**
 * Moves a member to another net-worth band (F2(a)).
 *
 * Only a Super Admin holds `user:change_category`, and the API audits the change
 * with the reason that is typed here, so the reason field says why it is needed
 * rather than just being an obstacle. The current band is preselected, so an
 * accidental submit cannot silently re-band anyone.
 */
export function CategoryForm({
  memberId,
  current,
  options,
}: {
  memberId: string;
  current: string;
  options: NetWorthCategoryOption[];
}) {
  const [category, setCategory] = useState(current);
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState(false);

  const { state, pending, run } = useAdminAction(changeCategoryAction, () => {
    setSaved(true);
    setReason('');
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaved(false);
    run({ id: memberId, category, reason });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="category">Net-worth band</label>
      <select id="category" value={category} onChange={(event) => setCategory(event.target.value)}>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
            {option.is_discoverable ? '' : ' (not discoverable)'}
          </option>
        ))}
      </select>

      <label htmlFor="category-reason">Reason (recorded in the audit log)</label>
      <textarea
        id="category-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />

      {state.error !== null ? <div className="error">{state.error}</div> : null}
      {saved && state.error === null ? <p className="notice">Band updated.</p> : null}

      <div className="actions">
        <button className="btn" type="submit" disabled={pending || category === current}>
          {pending ? 'Saving...' : category === current ? 'No change' : 'Change band'}
        </button>
      </div>
    </form>
  );
}

/**
 * Records a 24-hour manual authorisation for a profile's contact details
 * (section 28).
 *
 * What this writes is an `AdminGrantAudit` row and an audit entry - an
 * authorisation with a named administrator behind it and a reason attached. It
 * does not create a `ContactUnlock`, because the schema only allows one of those
 * to exist against a verified payment, so the form must not describe it as if it
 * had handed a member a free unlock.
 *
 * Hence a form with a required reason rather than a button on the member row:
 * the whole value of a payment-less disclosure is the record of who authorised
 * it and why.
 */
export function UnlockForm({ memberId, profileId }: { memberId: string; profileId: string }) {
  const [reason, setReason] = useState('');
  const [granted, setGranted] = useState(false);

  const { state, pending, run } = useAdminAction(grantUnlockAction, () => {
    setGranted(true);
    setReason('');
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setGranted(false);
    run({ id: memberId, profileId, reason });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="unlock-reason">Reason (recorded against the grant)</label>
      <textarea
        id="unlock-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />

      {state.error !== null ? <div className="error">{state.error}</div> : null}
      {granted && state.error === null ? (
        <p className="notice">Authorisation recorded for 24 hours.</p>
      ) : null}

      <div className="actions">
        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? 'Recording...' : 'Record 24-hour authorisation'}
        </button>
      </div>
    </form>
  );
}

/**
 * F6: undo a deletion inside the retention window.
 *
 * Deletion is deliberately reversible for a few months, so the console has to
 * offer the reversal somewhere other than a database console. What comes back is
 * the account, not its access: verification and payment are untouched, and the
 * profile returns to DRAFT for an ordinary review, so a restoration cannot put an
 * unreviewed profile into discovery.
 */
export function RestoreAccountForm({ memberId }: { memberId: string }) {
  const [reason, setReason] = useState('');
  const [restored, setRestored] = useState(false);

  const { state, pending, run } = useAdminAction(restoreAccountAction, () => {
    setRestored(true);
    setReason('');
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setRestored(false);
    run({ id: memberId, reason });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="restore-reason">Reason (recorded in the audit log)</label>
      <textarea
        id="restore-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />

      {state.error !== null ? <div className="error">{state.error}</div> : null}
      {restored && state.error === null ? (
        <p className="notice">Account restored. The member can sign in again.</p>
      ) : null}

      <div className="actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? 'Restoring...' : 'Restore account'}
        </button>
      </div>
    </form>
  );
}
