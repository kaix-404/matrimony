'use client';

import { useActionState, useState } from 'react';
import type { ReportActionType } from '@matrimony/shared';
import {
  REPORT_ACTIONS,
  REPORT_ACTION_LABELS,
  actionRequiresNotes,
  initialReviewState,
  statusForAction,
} from '@/lib/reports';
import { reviewReportAction } from './actions';

/** The resolve-report form. Submitting runs the server action and returns here. */
export function ReviewForm({ reportId }: { reportId: string }) {
  const [state, formAction, pending] = useActionState(reviewReportAction, initialReviewState);
  const [action, setAction] = useState<ReportActionType>('DISMISS');
  const notesRequired = actionRequiresNotes(action);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={reportId} />

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
      <textarea id="notes" name="notes" />

      {state.error !== null ? <div className="error">{state.error}</div> : null}

      <div className="actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? 'Resolving...' : 'Resolve report'}
        </button>
      </div>
    </form>
  );
}
