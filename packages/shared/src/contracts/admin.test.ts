import {
  ADMIN_PERMISSIONS,
  AdminListUsersQuerySchema,
  AdminLoginSchema,
  AdminRoleSlugSchema,
  permissionCatalogueRows,
} from './admin.js';
import { ADMIN_ROLE_SLUGS } from '../enums.js';

/**
 * Admin catalogue tests — sections 24–33.
 *
 * The catalogue is the one list guards check and the seed installs, so these
 * tests assert the properties that keep the two in agreement: every entry has a
 * resource and an action, sensitive keys are marked, and the derived seed rows
 * are a faithful projection of the catalogue.
 */

describe('ADMIN_PERMISSIONS catalogue', () => {
  it('has an entry for each permission the API is allowed to require', () => {
    expect(Object.keys(ADMIN_PERMISSIONS).sort()).toEqual(
      [
        'admin:manage',
        'audit:read',
        'data_request:handle',
        'identity_verify:review',
        'notification:send',
        'payment:read',
        'payment:refund',
        'photo:review',
        'pricing:read',
        'pricing:write',
        'profile:approve',
        'profile:read',
        'profile:reject',
        'profile:suspend',
        'report:review',
        'unlock:grant',
        'unlock:read',
        'user:change_category',
        'user:delete',
        'user:read',
        'user:suspend',
      ].sort(),
    );
  });

  it('qualifies every key with a resource and an action', () => {
    for (const [key, value] of Object.entries(ADMIN_PERMISSIONS)) {
      expect(key).toMatch(/^[a-z_]+:[a-z_]+$/);
      expect(value.resource.length).toBeGreaterThan(0);
      expect(value.action.length).toBeGreaterThan(0);
    }
  });

  it('marks F2(a) Super-Admin-only actions as sensitive', () => {
    for (const key of ['user:change_category', 'pricing:write', 'unlock:grant', 'user:delete']) {
      expect(ADMIN_PERMISSIONS[key as keyof typeof ADMIN_PERMISSIONS].sensitive).toBe(true);
    }
  });
});

describe('permissionCatalogueRows', () => {
  it('projects the catalogue one-to-one', () => {
    const rows = permissionCatalogueRows();
    expect(rows).toHaveLength(Object.keys(ADMIN_PERMISSIONS).length);
    for (const row of rows) {
      const source = ADMIN_PERMISSIONS[row.key];
      expect(row.resource).toBe(source.resource);
      expect(row.action).toBe(source.action);
      expect(row.isSensitive).toBe(source.sensitive);
    }
  });
});

describe('AdminRoleSlugSchema', () => {
  it('accepts exactly the roles declared in enums.ts', () => {
    for (const slug of ADMIN_ROLE_SLUGS) {
      expect(AdminRoleSlugSchema.parse(slug)).toBe(slug);
    }
    expect(AdminRoleSlugSchema.safeParse('HACKER').success).toBe(false);
  });
});

describe('AdminLoginSchema', () => {
  it('normalises the email and accepts a valid password', () => {
    expect(AdminLoginSchema.parse({ email: '  Boss@Example.COM ', password: 'correct horse' })).toEqual({
      email: 'boss@example.com',
      password: 'correct horse',
    });
  });

  it('rejects a short password and a malformed email', () => {
    expect(AdminLoginSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false);
    expect(AdminLoginSchema.safeParse({ email: 'not-an-email', password: 'longenough' }).success).toBe(false);
  });
});

describe('AdminListUsersQuerySchema', () => {
  it('defaults and caps the page size', () => {
    expect(AdminListUsersQuerySchema.parse({}).limit).toBe(20);
    expect(AdminListUsersQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});
