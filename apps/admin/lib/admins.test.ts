import type { AdminRoleView } from '@matrimony/shared';
import { isOwnRow, rolesNotHeld } from './admins';

const role = (slug: AdminRoleView['slug']): AdminRoleView => ({
  id: `role_${slug}`,
  slug,
  name: slug,
  description: null,
  permissions: [],
});

const CATALOGUE: AdminRoleView[] = [
  role('SUPER_ADMIN'),
  role('ADMIN'),
  role('MODERATION_ADMIN'),
  role('FINANCE_ADMIN'),
];

describe('rolesNotHeld', () => {
  it('offers only the roles the administrator does not already hold', () => {
    const grantable = rolesNotHeld(['ADMIN', 'FINANCE_ADMIN'], CATALOGUE);

    expect(grantable.map((entry) => entry.slug)).toEqual(['SUPER_ADMIN', 'MODERATION_ADMIN']);
  });

  it('offers nothing when every role is already held', () => {
    expect(rolesNotHeld(['SUPER_ADMIN', 'ADMIN', 'MODERATION_ADMIN', 'FINANCE_ADMIN'], CATALOGUE)).toEqual([]);
  });

  it('offers the whole catalogue to an administrator with no roles', () => {
    expect(rolesNotHeld([], CATALOGUE)).toHaveLength(CATALOGUE.length);
  });
});

describe('isOwnRow', () => {
  it('recognises the signed-in administrator', () => {
    expect(isOwnRow('admin_1', 'admin_1')).toBe(true);
    expect(isOwnRow('admin_1', 'admin_2')).toBe(false);
  });

  it('treats an unknown session as somebody else', () => {
    expect(isOwnRow('admin_1', null)).toBe(false);
  });
});
