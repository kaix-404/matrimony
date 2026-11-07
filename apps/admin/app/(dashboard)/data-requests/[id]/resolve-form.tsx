'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { initialResolveState } from '@/lib/data-requests';
import { resolveDataRequestAction } from './actions';

/** The two outcomes the API accepts; anything else is not a resolution. */
const OUTCOMES = [
  { value: 'COMPLETED', label: 'Completed - the member has been answered' },
  { value: 'REJECTED', label: 'Rejected - the request cannot be granted' },
] as const;

type Outcome = (typeof OUTCOMES)[number]['value'];

/**
 * The resolve-data-request form.
 *
 * It submits from React state rather than from the form's own fields. With a
 * `useActionState` form action React resets the form when the action returns,
 * which silently restored this select to its first option after a validation
 * error: the label still said "notes required" while the next submit sent
 * `COMPLETED`, so a refusal could be recorded as a completed erasure. Keeping the
 * chosen outcome and the typed notes in state, and building the request body from
 * them at submit time, means a rejected submit changes nothing the administrator
 * can see.
 *
 * The action redirects on success, so only a validation error comes back here.
 */
export function ResolveForm({ requestId }: { requestId: string }) {
  const [status, setStatus] = useState<Outcome>('COMPLETED');
  const [notes, setNotes] = useState('');
  const [state, setState] = useState(initialResolveState);
  const [pending, startTransition] = useTransition();
  const notesRequired = status === 'REJECTED';

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const formData = new FormData();
    formData.set('id', requestId);
    formData.set('status', status);
    formData.set('notes', notes);

    startTransition(async () => {
      setState(await resolveDataRequestAction(state, formData));
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="status">Outcome</label>
      <select
        id="status"
        name="status"
        value={status}
        onChange={(event) => setStatus(event.target.value as Outcome)}
      >
        {OUTCOMES.map((outcome) => (
          <option key={outcome.value} value={outcome.value}>
            {outcome.label}
          </option>
        ))}
      </select>
      <p className="notice">
        {status === 'COMPLETED'
          ? 'The request is recorded as answered and the clock stops.'
          : 'A refusal is a decision the member is entitled to read, so the note is required and is kept with the request.'}
      </p>

      <label htmlFor="notes">
        Resolution notes {notesRequired ? '(required)' : '(optional)'}
      </label>
      <textarea
        id="notes"
        name="notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />

      {state.error !== null ? <div className="error">{state.error}</div> : null}

      <div className="actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? 'Resolving...' : 'Resolve request'}
        </button>
      </div>
    </form>
  );
}
