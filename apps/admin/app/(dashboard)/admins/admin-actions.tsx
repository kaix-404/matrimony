'use client';

import { useState } from 'react';
import type { AdminRoleView, AdminUserView } from '@matrimony/shared';
import { isOwnRow, rolesNotHeld } from '@/lib/admins';
import { useAdminAction } from '@/lib/use-admin-action';
import { grantRoleAction, resetMfaAction, revokeRoleAction, setPhoneAction } from './actions';

/**
 * Role, authenticator and sign-in-number controls for one administrator.
 *
 * An administrator's own row gets an explanation instead of role and MFA
 * controls: the API refuses a role change or MFA reset aimed at the caller,
 * because either is a way to lock yourself out (and with the last Super Admin,
 * everyone). Saying so is more useful than a button that can only fail.
 *
 * The one control that stays usable there is the SMS sign-in number. Enrolling
 * the phone that receives your own codes is not a privilege escalation, and
 * requiring a second administrator would make the factor unusable for whoever
 * runs the console alone.
 */
export function AdminActions({
  admin,
  roles,
  selfId,
}: {
  admin: AdminUserView;
  roles: AdminRoleView[];
  selfId: string | null;
}) {
  const own = isOwnRow(admin.id, selfId);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {own ? (
        <p className="notice">
          Your own account. Another administrator has to change your roles or reset your
          authenticator.
        </p>
      ) : null}
      <AdminControls admin={admin} roles={roles} own={own} />
    </div>
  );
}

function AdminControls({
  admin,
  roles,
  own,
}: {
  admin: AdminUserView;
  roles: AdminRoleView[];
  own: boolean;
}) {
  // Nobody may change their own roles or reset their own authenticator, so the
  // pickers are left out rather than offered and then refused.
  const grantable = own ? [] : rolesNotHeld(admin.roles, roles);
  const held = own ? [] : roles.filter((role) => admin.roles.includes(role.slug));

  const [grantSlug, setGrantSlug] = useState(grantable[0]?.slug ?? '');
  const [revokeSlug, setRevokeSlug] = useState(held[0]?.slug ?? '');
  const [confirmingReset, setConfirmingReset] = useState(false);

  const grant = useAdminAction(grantRoleAction);
  const revoke = useAdminAction(revokeRoleAction);
  const reset = useAdminAction(resetMfaAction);

  const pending = grant.pending || revoke.pending || reset.pending;
  const error = grant.state.error ?? revoke.state.error ?? reset.state.error;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {grantable.length > 0 ? (
        <div className="actions">
          <select
            aria-label={`Role to grant ${admin.email}`}
            value={grantSlug}
            onChange={(event) => setGrantSlug(event.target.value)}
            disabled={pending}
          >
            {grantable.map((role) => (
              <option key={role.id} value={role.slug}>
                {role.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={pending || grantSlug.length === 0}
            onClick={() => grant.run({ id: admin.id, role: grantSlug })}
          >
            Grant
          </button>
        </div>
      ) : null}

      {held.length > 0 ? (
        <div className="actions">
          <select
            aria-label={`Role to revoke ${admin.email}`}
            value={revokeSlug}
            onChange={(event) => setRevokeSlug(event.target.value)}
            disabled={pending}
          >
            {held.map((role) => (
              <option key={role.id} value={role.slug}>
                {role.name}
              </option>
            ))}
          </select>
          <button
            className="btn-link"
            type="button"
            disabled={pending || revokeSlug.length === 0}
            onClick={() => revoke.run({ id: admin.id, role: revokeSlug })}
          >
            Revoke
          </button>
        </div>
      ) : null}

      {/* The SMS sign-in switch. Shown for every administrator, including one with
          an authenticator enrolled: the number is still what a reset fallback
          would use, and an account can carry both. */}
      <PhoneControl admin={admin} own={own} disabled={pending} />

      {admin.mfaEnabled ? (
        confirmingReset ? (
          <div className="actions">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={pending}
              onClick={() => {
                reset.run({ id: admin.id });
                setConfirmingReset(false);
              }}
            >
              Confirm reset
            </button>
            <button
              className="btn-link"
              type="button"
              disabled={pending}
              onClick={() => setConfirmingReset(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="btn-link"
            type="button"
            disabled={pending}
            onClick={() => setConfirmingReset(true)}
          >
            Reset authenticator
          </button>
        )
      ) : null}

      {error !== null ? <div className="error">{error}</div> : null}
    </div>
  );
}

/**
 * Sets or clears one administrator's SMS sign-in number.
 *
 * Your own row and everybody else's need the same editor, so this is the only
 * copy; `own` changes the wording and nothing else. An empty field clears the
 * number, which is the documented way back for a lost SIM — the API validates
 * what is sent and records the change in the audit log.
 */
function PhoneControl({
  admin,
  own,
  disabled,
}: {
  admin: AdminUserView;
  own: boolean;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(admin.phone ?? '');
  const save = useAdminAction(setPhoneAction, () => setEditing(false));

  // The save in flight blocks this control; `disabled` carries the role and MFA
  // actions, which own their own pending state one level up.
  const pending = disabled || save.pending;
  const label = own ? 'My SMS sign-in number' : `SMS sign-in number for ${admin.email}`;
  const toggleLabel =
    admin.phone === null
      ? own
        ? 'Add my SMS sign-in number'
        : 'Add SMS sign-in number'
      : own
        ? `Change my SMS sign-in number (${admin.phone})`
        : 'Change SMS sign-in number';

  if (!editing) {
    return (
      <button
        className="btn-link"
        type="button"
        disabled={pending}
        onClick={() => setEditing(true)}
      >
        {toggleLabel}
      </button>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <input
        aria-label={label}
        inputMode="tel"
        placeholder="10-digit mobile, empty to clear"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        disabled={pending}
      />
      <div className="actions">
        <button
          className="btn btn-secondary"
          type="button"
          disabled={pending}
          onClick={() => save.run({ id: admin.id, phone })}
        >
          Save number
        </button>
        <button
          className="btn-link"
          type="button"
          disabled={pending}
          onClick={() => {
            setEditing(false);
            setPhone(admin.phone ?? '');
          }}
        >
          Cancel
        </button>
      </div>
      {save.state.error !== null ? <div className="error">{save.state.error}</div> : null}
    </div>
  );
}
