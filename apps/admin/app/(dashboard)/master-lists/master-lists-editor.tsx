'use client';

import { useState } from 'react';
import {
  MASTER_LIST_VALUE_MAX_LENGTH,
  type AdminMasterListView,
  type AdminMasterListValueView,
} from '@matrimony/shared';
import { groupValues, hasSections, visibleValues } from '@/lib/master-lists';
import { useAdminAction } from '@/lib/use-admin-action';
import { createValueAction, updateValueAction } from './actions';

/**
 * The master lists, editable.
 *
 * The shape follows how the lists are actually used rather than a generic form:
 * a list is chosen first, because 835 sub-castes and 36 states have nothing to
 * do with each other; sections are shown as sections, because a sub-caste is
 * only meaningful under its religion and an occupation under its industry; and
 * each row edits and retires itself, because an administrator fixing one
 * spelling should not have to save a page of them.
 */
export function MasterListsEditor({ lists }: { lists: AdminMasterListView[] }) {
  const [selectedKey, setSelectedKey] = useState(lists[0]?.key ?? '');
  const [query, setQuery] = useState('');

  const list = lists.find((entry) => entry.key === selectedKey) ?? lists[0];
  if (list === undefined) {
    return <p className="notice">No master list exists yet, so there is nothing to edit.</p>;
  }

  const { shown, total, truncated } = visibleValues(list.values, query);
  const sections = groupValues(shown);
  const grouped = hasSections(groupValues(list.values));

  return (
    <>
      <div className="card">
        <label htmlFor="master-list">List</label>
        <select
          id="master-list"
          value={list.key}
          onChange={(event) => {
            setSelectedKey(event.target.value);
            setQuery('');
          }}
        >
          {lists.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label} ({entry.values.length}){entry.is_active ? '' : ' - turned off'}
            </option>
          ))}
        </select>

        <p className="notice">
          Retiring removes a value from the member&apos;s picker but keeps it on every profile that
          already chose it, and it can be restored here. Renaming changes the label everywhere at
          once, which is how a misspelling sent by the client is corrected.
          {grouped
            ? ' Values are grouped by section; a sub-caste can only be added to a religion.'
            : ''}
        </p>

        <label htmlFor="master-search">Find a value</label>
        <input
          id="master-search"
          value={query}
          placeholder={grouped ? 'Section or value, e.g. Hindu, Odisha' : 'e.g. Odisha'}
          onChange={(event) => setQuery(event.target.value)}
        />
        <p className="notice">
          {total === 0
            ? 'Nothing matches that search.'
            : `${total} ${total === 1 ? 'value matches' : 'values match'}${
                truncated
                  ? `, showing the first ${shown.length} - narrow the search to see the rest`
                  : ''
              }.`}
        </p>
      </div>

      {sections.length === 0 ? (
        <div className="card">
          <h2>{list.label}</h2>
          <p className="notice">
            {list.values.length === 0
              ? 'This list has no values yet. Add the first one below - the picker stays hidden until it has at least one.'
              : 'No value matches the search.'}
          </p>
        </div>
      ) : (
        sections.map((section) => (
          <div className="card" key={section.group ?? `${list.key}-flat`}>
            <h2>
              {section.group ?? list.label}{' '}
              <span className="mono" style={{ color: 'var(--muted)', fontWeight: 400 }}>
                {section.values.length}
              </span>
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Value</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {section.values.map((row) => (
                  <ValueRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      <AddValueForm key={list.key} list={list} />
    </>
  );
}

/**
 * One value: rename it, retire it, or restore it.
 *
 * The row owns its own pending and error state so a failed rename names the row
 * that failed instead of printing one error under a table of hundreds. The
 * input starts at the stored label, which makes a correction a small edit rather
 * than a retype.
 */
function ValueRow({ row }: { row: AdminMasterListValueView }) {
  const [value, setValue] = useState(row.value);
  const [saved, setSaved] = useState(false);
  const { state, pending, run } = useAdminAction(updateValueAction, () => {
    setSaved(true);
    setValue(row.value);
  });

  const trimmed = value.trim();
  const renamed = trimmed.length > 0 && trimmed !== row.value;

  return (
    <tr>
      <td>
        <input
          aria-label={`Rename ${row.value}`}
          value={value}
          maxLength={MASTER_LIST_VALUE_MAX_LENGTH}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
        />
        {state.error !== null ? <div className="error">{state.error}</div> : null}
        {saved && state.error === null ? (
          <p className="notice">Saved. Members see the new label from their next load.</p>
        ) : null}
      </td>
      <td>
        {row.is_active ? (
          <span className="badge badge-ok">Offered</span>
        ) : (
          <span style={{ color: 'var(--muted)' }}>Retired</span>
        )}
      </td>
      <td className="actions">
        <button
          className="btn"
          type="button"
          disabled={pending || !renamed}
          onClick={() => run({ id: row.id, value: trimmed })}
        >
          {pending ? 'Saving...' : 'Save name'}
        </button>
        <button
          className="btn"
          type="button"
          disabled={pending}
          onClick={() => run({ id: row.id, is_active: String(!row.is_active) })}
        >
          {row.is_active ? 'Retire' : 'Restore'}
        </button>
      </td>
    </tr>
  );
}

/**
 * Adds one value to the chosen list.
 *
 * The section is a datalist, not a select with a fixed set of options: education
 * and occupation may legitimately gain a new section, while the API rejects a
 * section that is not a religion for sub-castes. Offering the existing sections
 * as suggestions keeps the common case a click and still lets the client enter a
 * new industry without waiting for a release.
 */
function AddValueForm({ list }: { list: AdminMasterListView }) {
  const sections = groupValues(list.values)
    .map((section) => section.group)
    .filter((group): group is string => group !== null);

  const [value, setValue] = useState('');
  const [group, setGroup] = useState(sections[0] ?? '');
  const [added, setAdded] = useState<string | null>(null);

  const { state, pending, run } = useAdminAction(createValueAction, () => {
    setAdded(value.trim());
    setValue('');
  });

  const needsSection = sections.length > 0;
  const datalistId = `sections-${list.key}`;
  const ready = value.trim().length > 0 && (!needsSection || group.trim().length > 0);

  return (
    <div className="card">
      <h2>Add to {list.label}</h2>
      <form
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          setAdded(null);
          run({ key: list.key, value, ...(needsSection ? { group } : {}) });
        }}
      >
        <label htmlFor="new-value">Value</label>
        <input
          id="new-value"
          name="value"
          value={value}
          maxLength={MASTER_LIST_VALUE_MAX_LENGTH}
          placeholder={needsSection ? 'e.g. Odisha, or a new caste' : 'e.g. Odisha'}
          onChange={(event) => {
            setValue(event.target.value);
            setAdded(null);
          }}
        />

        {needsSection ? (
          <>
            <label htmlFor="new-group">Section</label>
            <input
              id="new-group"
              name="group"
              list={datalistId}
              value={group}
              maxLength={MASTER_LIST_VALUE_MAX_LENGTH}
              onChange={(event) => {
                setGroup(event.target.value);
                setAdded(null);
              }}
            />
            <datalist id={datalistId}>
              {sections.map((section) => (
                <option key={section} value={section} />
              ))}
            </datalist>
            <p className="notice">
              {list.key === 'CASTE'
                ? 'Pick one of the religions above. Sub-castes are only offered to members who chose that religion.'
                : 'Pick an existing section, or type a new one to start it.'}
            </p>
          </>
        ) : null}

        {state.error !== null ? <div className="error">{state.error}</div> : null}
        {added !== null && state.error === null ? (
          <p className="notice">Added {added}. It is offered to members now.</p>
        ) : null}

        <div className="actions">
          <button className="btn" type="submit" disabled={pending || !ready}>
            {pending ? 'Adding...' : 'Add value'}
          </button>
        </div>
      </form>
    </div>
  );
}
