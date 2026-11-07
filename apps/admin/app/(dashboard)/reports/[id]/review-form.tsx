'use client';

import { useState, useTransition, type FormEvent } from 'react';
import type { ReportActionType } from '@matrimony/shared';
import {
  REPORT_ACTIONS,
  REPORT_ACTION_LABELS,
  actionRequiresNotes,
  initialReviewState,
  statusForAction,
} from '@/lib/reports';
import { reviewReportAction } from './actions';

/**
 * The resolve-report form.
 *
 * It submits from React state rather than from the form's own fields. With a
 * `useActionState` form action React resets the form when the action returns,
 * which restored the action select to its first option after a validation error:
 * the label still asked for notes while the next submit sent `DISMISS`, so a
 * reviewer who meant to suspend an account would silently dismiss the report.
 * Holding the action and the notes in state and building the request body at
 * submit time means a rejected submit changes nothing on screen.
 *
 * The action redirects on success, so only a validation error comes back here.
 */
export function ReviewForm({ reportId }: { reportId: string }) {
  const [action, setAction] = useState<ReportActionType>('DISMISS');
  const [notes, setNotes] = useState('');
  const [state, setState] = useState(initialReviewState);
  const [pending, startTransition] = useTransition();
  const notesRequired = actionRequiresNotes(action);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const formData = new FormData();
    formData.set('id', reportId);
    formData.set('action', action);
    formData.set('notes', notes);

    startTransition(async () => {
      setState(await reviewReportAction(state, formData));
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="action">Action</label>
      <select
        id="action"
        name="action"
        value={action}
        onChange={(event) => setAction(event.target.value as ReportActionType)}
      >
        {REPORT_ACTIONS.map((value) => (
          <option key={value} value={value}>
            {REPORT_ACTION_LABELS[value]}
          </option>
        ))}
      </select>
      <p className="notice">
        This will be filed as <strong>{statusForAction(action)}</strong>.
        {action === 'SUSPEND' ? ' The reported account is suspended as well.' : ''}
      </p>

      <label htmlFor="notes">Review notes {notesRequired ? '(required)' : '(optional)'}</label>
      <textarea
        id="notes"
        name="notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />

      {state.error !== null ? <div className="error">{state.error}</div> : null}

      <div className="actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? 'Resolving...' : 'Resolve report'}
        </button>
      </div>
    </form>
  );
}
