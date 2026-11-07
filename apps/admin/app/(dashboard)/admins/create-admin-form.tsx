'use client';

import { useState, type FormEvent } from 'react';
import type { AdminRoleView } from '@matrimony/shared';
import { ADMIN_PASSWORD_MIN_LENGTH } from '@/lib/admins';
import { useAdminAction } from '@/lib/use-admin-action';
import { createAdminAction } from './actions';

/**
 * Adds an administrator and assigns their first roles.
 *
 * Roles are shown from the API's own catalogue with the permissions each one
 * grants, because "which role gives someone the refund button" is the question
 * an operator actually has when creating an account.
 *
 * The account is created with a password chosen here and handed over out of
 * band; nothing is emailed, and the API never returns the password or its hash.
 */
export function CreateAdminForm({ roles }: { roles: AdminRoleView[] }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [created, setCreated] = useState<string | null>(null);

  // Cleared only after the account exists: a rejected submission keeps every
  // field, and the operator does not have to retype a password they just chose.
  const { state, pending, run } = useAdminAction(createAdminAction, () => {
    setCreated(email.trim().toLowerCase());
    setName('');
    setEmail('');
    setPassword('');
    setSelected([]);
  });

  function toggle(slug: string): void {
    setSelected((previous) =>
      previous.includes(slug) ? previous.filter((entry) => entry !== slug) : [...previous, slug],
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setCreated(null);
    run({ name, email, password, roles: selected });
  }

  return (
    <div className="card">
      <h2>Add an administrator</h2>
      <p className="notice">
        Give the password to the person directly and have them enrol an authenticator at first
        sign-in. Roles decide what they can do; the API checks every one of them.
      </p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="new-name">Name</label>
        <input
          id="new-name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />

        <label htmlFor="new-email">Email</label>
        <input
          id="new-email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="off"
        />

        <label htmlFor="new-password">Password</label>
        <input
          id="new-password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
        />
        <p className="notice">At least {ADMIN_PASSWORD_MIN_LENGTH} characters.</p>

        <fieldset>
          <legend>Roles</legend>
          {roles.map((role) => (
            <label key={role.id} htmlFor={`role-${role.slug}`} className="checkbox-row">
              <input
                id={`role-${role.slug}`}
                type="checkbox"
                checked={selected.includes(role.slug)}
                onChange={() => toggle(role.slug)}
              />
              <span>
                {role.name} <span className="mono">({role.slug})</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="notice">
          {roles
            .filter((role) => selected.includes(role.slug))
            .map((role) =>
              role.permissions.length > 0
                ? `${role.name}: ${role.permissions.map((permission) => permission.key).join(', ')}`
                : `${role.name}: no permissions`,
            )
            .join(' · ') || 'No role selected yet.'}
        </p>

        {state.error !== null ? <div className="error">{state.error}</div> : null}
        {created !== null && state.error === null ? (
          <p className="notice">Created {created}. They can sign in with the password you set.</p>
        ) : null}

        <div className="actions">
          <button className="btn" type="submit" disabled={pending}>
            {pending ? 'Creating...' : 'Create administrator'}
          </button>
        </div>
      </form>
    </div>
  );
}
