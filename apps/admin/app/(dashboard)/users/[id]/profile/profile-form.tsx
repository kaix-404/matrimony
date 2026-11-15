'use client';

import { useState, type FormEvent } from 'react';
import type { AdminProfileDetail } from '@matrimony/shared';
import { useAdminAction } from '@/lib/use-admin-action';
import { PROFILE_EDIT_SECTIONS, type EditFieldSpec } from '@/lib/profile-fields';
import { updateProfileAction } from './actions';

const ALL_FIELDS: EditFieldSpec[] = PROFILE_EDIT_SECTIONS.flatMap((section) => section.fields);

/** The stored value as an input's text. Lists are comma separated. */
function initialValue(profile: AdminProfileDetail, spec: EditFieldSpec): string {
  const raw = (profile as unknown as Record<string, unknown>)[spec.key];
  if (Array.isArray(raw)) return raw.join(', ');
  return raw === null || raw === undefined ? '' : String(raw);
}

/** The input's text back to the type the contract expects. */
function parseValue(spec: EditFieldSpec, text: string): unknown {
  if (spec.type === 'list') {
    return text
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }
  if (spec.type === 'number') {
    const trimmed = text.trim();
    return trimmed === '' ? null : Number.parseInt(trimmed, 10);
  }
  const trimmed = text.trim();
  if (trimmed === '') {
    // The first name is the one field the API will not accept empty.
    return spec.key === 'first_name' ? trimmed : null;
  }
  return trimmed;
}

/**
 * Corrects a member's profile.
 *
 * Only the fields that actually changed are sent, so the audit row names exactly
 * what an administrator touched. The moderation state is not part of this form:
 * correcting a typo is not a review decision, and the API leaves APPROVED alone.
 */
export function ProfileEditForm({ profile }: { profile: AdminProfileDetail }) {
  const initial = Object.fromEntries(
    ALL_FIELDS.map((spec) => [spec.key, initialValue(profile, spec)]),
  ) as Record<string, string>;

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const { state, pending, run } = useAdminAction(updateProfileAction, () => {
    setSaved(true);
    setReason('');
    setLocalError(null);
  });

  function set(key: string, value: string): void {
    setSaved(false);
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaved(false);
    setLocalError(null);

    const changed: Record<string, unknown> = {};
    for (const spec of ALL_FIELDS) {
      if ((values[spec.key] ?? '') === initial[spec.key]) continue;
      changed[spec.key] = parseValue(spec, values[spec.key] ?? '');
    }

    if (Object.keys(changed).length === 0) {
      setLocalError('Nothing has changed yet.');
      return;
    }
    if (reason.trim().length === 0) {
      setLocalError('Give a reason for the correction.');
      return;
    }

    run({ id: profile.user_id, payload: JSON.stringify({ ...changed, reason: reason.trim() }) });
  }

  return (
    <form onSubmit={handleSubmit}>
      {PROFILE_EDIT_SECTIONS.map((section) => (
        <fieldset key={section.title}>
          <legend>{section.title}</legend>
          {section.fields.map((spec) => (
            <div key={spec.key}>
              <label htmlFor={`field-${spec.key}`}>{spec.label}</label>
              {spec.type === 'textarea' ? (
                <textarea
                  id={`field-${spec.key}`}
                  value={values[spec.key] ?? ''}
                  maxLength={spec.maxLength}
                  onChange={(event) => set(spec.key, event.target.value)}
                />
              ) : spec.type === 'select' ? (
                <select
                  id={`field-${spec.key}`}
                  value={values[spec.key] ?? ''}
                  onChange={(event) => set(spec.key, event.target.value)}
                >
                  <option value="">Not answered</option>
                  {(spec.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`field-${spec.key}`}
                  type={spec.type === 'number' ? 'number' : spec.type === 'date' ? 'date' : 'text'}
                  value={values[spec.key] ?? ''}
                  maxLength={spec.maxLength}
                  onChange={(event) => set(spec.key, event.target.value)}
                />
              )}
              {spec.hint !== undefined ? <small className="mono">{spec.hint}</small> : null}
            </div>
          ))}
        </fieldset>
      ))}

      <label htmlFor="profile-reason">Reason (recorded in the audit log)</label>
      <textarea
        id="profile-reason"
        value={reason}
        onChange={(event) => {
          setSaved(false);
          setReason(event.target.value);
        }}
      />

      {localError !== null ? <div className="error">{localError}</div> : null}
      {state.error !== null ? <div className="error">{state.error}</div> : null}
      {saved && state.error === null ? <p className="notice">Profile updated.</p> : null}

      <div className="actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? 'Saving...' : 'Save correction'}
        </button>
      </div>
    </form>
  );
}
