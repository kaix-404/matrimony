'use client';

import { useState } from 'react';
import type { AdminRoleView, AdminUserView } from '@matrimony/shared';
import { isOwnRow, rolesNotHeld } from '@/lib/admins';
import { useAdminAction } from '@/lib/use-admin-action';
import { grantRoleAction, resetMfaAction, revokeRoleAction, setPhoneAction } from './actions';

/**
 * Role and authenticator controls for one administrator.
 *
 * An administrator's own row gets an explanation instead of controls: the API
 * refuses a role change or MFA reset aimed at the caller, because either is a
 * way to lock yourself out (and with the last Super Admin, everyone). Saying so
 * is more useful than a button that can only fail.
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
  if (isOwnRow(admin.id, selfId)) {
    return (
      <>
        <p className="notice">
          Your own account. Another administrator has to change your roles or reset your
          authenticator.
        </p>
        {/* The one thing you can change here is your own sign-in number: enrolling
            the phone that receives your sign-in codes is not a privilege escalation,
            and requiring a second administrator would make the factor unusable for
            whoever runs the console alone. */}
        <OwnPhoneControl admin={admin} />
      </>
    );
  }

  return <AdminControls admin={admin} roles={roles} />;
}

function AdminControls({ admin, roles }: { admin: AdminUserView; roles: AdminRoleView[] }) {
  const grantable = rolesNotHeld(admin.roles, roles);
  const held = roles.filter((role) => admin.roles.includes(role.slug));

  const [grantSlug, setGrantSlug] = useState(grantable[0]?.slug ?? '');
  const [revokeSlug, setRevokeSlug] = useState(held[0]?.slug ?? '');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phone, setPhoneNumber] = useState(admin.phone ?? '');

  const grant = useAdminAction(grantRoleAction);
  const revoke = useAdminAction(revokeRoleAction);
  const reset = useAdminAction(resetMfaAction);
  const setPhone = useAdminAction(setPhoneAction, () => setEditingPhone(false));

  const pending = grant.pending || revoke.pending || reset.pending || setPhone.pending;
  const error = grant.state.error ?? revoke.state.error ?? reset.state.error ?? setPhone.state.error;

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
      {editingPhone ? (
        <div className="actions">
          <input
            aria-label={`SMS sign-in number for ${admin.email}`}
            inputMode="tel"
            placeholder="10-digit mobile, empty to clear"
            value={phone}
            onChange={(event) => setPhoneNumber(event.target.value)}
            disabled={pending}
          />
          <button
            className="btn btn-secondary"
            type="button"
            disabled={pending}
            onClick={() => setPhone.run({ id: admin.id, phone })}
          >
            Save number
          </button>
          <button
            className="btn-link"
            type="button"
            disabled={pending}
            onClick={() => {
              setEditingPhone(false);
              setPhoneNumber(admin.phone ?? '');
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          className="btn-link"
          type="button"
          disabled={pending}
          onClick={() => setEditingPhone(true)}
        >
          {admin.phone === null ? 'Add SMS sign-in number' : 'Change SMS sign-in number'}
        </button>
      )}

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

/** Sets an administrator's own SMS sign-in number. */
function OwnPhoneControl({ admin }: { admin: AdminUserView }) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhoneNumber] = useState(admin.phone ?? '');
  const save = useAdminAction(setPhoneAction, () => setEditing(false));

  if (!editing) {
    return (
      <button className="btn-link" type="button" disabled={save.pending} onClick={() => setEditing(true)}>
        {admin.phone === null
          ? 'Add my SMS sign-in number'
          : `Change my SMS sign-in number (${admin.phone})`}
      </button>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <input
        aria-label="My SMS sign-in number"
        inputMode="tel"
        placeholder="10-digit mobile, empty to clear"
        value={phone}
        onChange={(event) => setPhoneNumber(event.target.value)}
        disabled={save.pending}
      />
      <div className="actions">
        <button
          className="btn btn-secondary"
          type="button"
          disabled={save.pending}
          onClick={() => save.run({ id: admin.id, phone })}
        >
          Save number
        </button>
        <button
          className="btn-link"
          type="button"
          disabled={save.pending}
          onClick={() => {
            setEditing(false);
            setPhoneNumber(admin.phone ?? '');
          }}
        >
          Cancel
        </button>
      </div>
      {save.state.error !== null ? <div className="error">{save.state.error}</div> : null}
    </div>
  );
}
