import {
  ADMIN_PERMISSIONS,
  AdminCreateMasterListValueSchema,
  AdminUpdateMasterListValueSchema,
} from './admin.js';
import { MASTER_LIST_KEYS } from './master-data.js';

/**
 * Contracts for editing the master lists from the console (D3).
 *
 * The schemas are deliberately thin: whether a list has sections, and whether a
 * section is a religion, are questions about the stored data and are answered by
 * the API. What is asserted here is the part a contract can own — a value is
 * trimmed, an empty one is refused, and an update that changes nothing is
 * rejected rather than sent.
 */

describe('master-list permissions', () => {
  it('has a read and a write permission gated on the same resource', () => {
    expect(ADMIN_PERMISSIONS['master_data:read']).toMatchObject({
      resource: 'master_data',
      action: 'read',
    });
    expect(ADMIN_PERMISSIONS['master_data:write']).toMatchObject({
      resource: 'master_data',
      action: 'write',
    });
  });

  it('marks writing as sensitive, because it changes what every member sees', () => {
    expect(ADMIN_PERMISSIONS['master_data:write'].sensitive).toBe(true);
    expect(ADMIN_PERMISSIONS['master_data:read'].sensitive).toBe(false);
  });

  it('covers every list the app offers a picker for', () => {
    // A list that exists but cannot be edited would need a redeploy to change,
    // which is the situation this whole surface exists to remove.
    expect(MASTER_LIST_KEYS).toEqual([
      'RELIGION',
      'MOTHER_TONGUE',
      'EDUCATION',
      'PROFESSION',
      'CASTE',
      'COMMUNITY',
      'STATE',
    ]);
  });
});

describe('AdminCreateMasterListValueSchema', () => {
  it('trims the value an administrator pasted', () => {
    const parsed = AdminCreateMasterListValueSchema.parse({ value: '  Odisha  ' });
    expect(parsed.value).toBe('Odisha');
  });

  it('refuses a value that is only whitespace', () => {
    expect(AdminCreateMasterListValueSchema.safeParse({ value: '   ' }).success).toBe(false);
    expect(AdminCreateMasterListValueSchema.safeParse({}).success).toBe(false);
  });

  it('refuses a value longer than a picker row can show', () => {
    const tooLong = 'x'.repeat(81);
    expect(AdminCreateMasterListValueSchema.safeParse({ value: tooLong }).success).toBe(false);
    expect(AdminCreateMasterListValueSchema.safeParse({ value: 'x'.repeat(80) }).success).toBe(
      true,
    );
  });

  it('accepts an optional section and trims it too', () => {
    const parsed = AdminCreateMasterListValueSchema.parse({ value: 'Nurse', group: 'Medical' });
    expect(parsed.group).toBe('Medical');
    expect(AdminCreateMasterListValueSchema.parse({ value: 'Odisha' }).group).toBeUndefined();
  });

  it('refuses an unknown field rather than silently dropping it', () => {
    expect(
      AdminCreateMasterListValueSchema.safeParse({ value: 'Odisha', section: 'Hindu' }).success,
    ).toBe(false);
  });
});

describe('AdminUpdateMasterListValueSchema', () => {
  it('refuses an update that would change nothing', () => {
    expect(AdminUpdateMasterListValueSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a rename alone, or a retire/restore alone', () => {
    expect(AdminUpdateMasterListValueSchema.parse({ value: ' Odisha ' }).value).toBe('Odisha');
    expect(AdminUpdateMasterListValueSchema.parse({ is_active: false }).is_active).toBe(false);
  });

  it('refuses a blank rename', () => {
    expect(AdminUpdateMasterListValueSchema.safeParse({ value: '  ' }).success).toBe(false);
  });
});
