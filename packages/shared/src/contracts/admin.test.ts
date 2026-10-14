import {
  ADMIN_PERMISSIONS,
  AdminAssignRoleSchema,
  AdminChangeCategorySchema,
  AdminCreateSchema,
  AdminGrantUnlockSchema,
  AdminListAdminsQuerySchema,
  AdminListDataRequestsQuerySchema,
  AdminListReportsQuerySchema,
  AdminListUsersQuerySchema,
  AdminLoginResponseSchema,
  AdminLoginSchema,
  AdminMfaActivateSchema,
  AdminMfaChallengeSchema,
  AdminMfaCodeSchema,
  AdminMfaDisableSchema,
  AdminMfaVerifySchema,
  AdminPublishPricingSchema,
  AdminResolveDataRequestSchema,
  AdminReviewReportSchema,
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

describe('AdminCreateSchema', () => {
  it('normalises the email and name and accepts a valid administrator', () => {
    const parsed = AdminCreateSchema.parse({
      email: ' New.Admin@Example.COM ',
      name: ' New Admin ',
      password: 'a-strong-password',
      roles: ['ADMIN', 'FINANCE_ADMIN'],
    });
    expect(parsed.email).toBe('new.admin@example.com');
    expect(parsed.name).toBe('New Admin');
    expect(parsed.roles).toEqual(['ADMIN', 'FINANCE_ADMIN']);
  });

  it('requires a password of at least 12 characters', () => {
    const result = AdminCreateSchema.safeParse({
      email: 'a@b.com',
      name: 'A',
      password: 'short',
      roles: ['ADMIN'],
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one role and rejects duplicates', () => {
    const base = { email: 'a@b.com', name: 'A', password: 'long-enough-1' };
    expect(AdminCreateSchema.safeParse({ ...base, roles: [] }).success).toBe(false);
    expect(AdminCreateSchema.safeParse({ ...base, roles: ['ADMIN', 'ADMIN'] }).success).toBe(false);
  });
});

describe('AdminAssignRoleSchema', () => {
  it('accepts a known role and rejects anything else', () => {
    expect(AdminAssignRoleSchema.parse({ role: 'MODERATION_ADMIN' }).role).toBe('MODERATION_ADMIN');
    expect(AdminAssignRoleSchema.safeParse({ role: 'ROOT' }).success).toBe(false);
  });
});

describe('AdminListAdminsQuerySchema', () => {
  it('defaults and caps the page size', () => {
    expect(AdminListAdminsQuerySchema.parse({}).limit).toBe(20);
    expect(AdminListAdminsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe('AdminChangeCategorySchema', () => {
  it('requires a category and a reason', () => {
    expect(
      AdminChangeCategorySchema.parse({ category: 'BELOW_2CR', reason: 'Evidence reviewed' }),
    ).toEqual({ category: 'BELOW_2CR', reason: 'Evidence reviewed' });
    expect(AdminChangeCategorySchema.safeParse({ category: 'BELOW_2CR' }).success).toBe(false);
    expect(AdminChangeCategorySchema.safeParse({ category: '', reason: 'x' }).success).toBe(false);
  });
});

describe('AdminPublishPricingSchema', () => {
  it('accepts a rupee amount and a percentage GST rate', () => {
    expect(
      AdminPublishPricingSchema.parse({ category: 'BELOW_2CR', baseAmount: '99.00', gstPercent: 18 }),
    ).toEqual({ category: 'BELOW_2CR', baseAmount: '99.00', gstPercent: 18 });
  });

  it('rejects a malformed amount and an out-of-range rate', () => {
    expect(
      AdminPublishPricingSchema.safeParse({ category: 'X', baseAmount: '9.999', gstPercent: 18 }).success,
    ).toBe(false);
    expect(
      AdminPublishPricingSchema.safeParse({ category: 'X', baseAmount: '99', gstPercent: 101 }).success,
    ).toBe(false);
  });
});

describe('AdminGrantUnlockSchema', () => {
  it('requires a profile and a reason', () => {
    expect(AdminGrantUnlockSchema.parse({ profileId: 'p1', reason: 'Goodwill' })).toEqual({
      profileId: 'p1',
      reason: 'Goodwill',
    });
    expect(AdminGrantUnlockSchema.safeParse({ profileId: 'p1', reason: '' }).success).toBe(false);
  });
});

describe('AdminListDataRequestsQuerySchema', () => {
  it('defaults the page size and accepts a status filter', () => {
    expect(AdminListDataRequestsQuerySchema.parse({}).limit).toBe(20);
    expect(AdminListDataRequestsQuerySchema.parse({ status: 'COMPLETED' }).status).toBe('COMPLETED');
    expect(AdminListDataRequestsQuerySchema.safeParse({ status: 'NOPE' }).success).toBe(false);
  });
});

describe('AdminResolveDataRequestSchema', () => {
  it('accepts a completion without notes', () => {
    expect(AdminResolveDataRequestSchema.parse({ status: 'COMPLETED' }).status).toBe('COMPLETED');
  });

  it('requires notes to reject', () => {
    expect(AdminResolveDataRequestSchema.safeParse({ status: 'REJECTED' }).success).toBe(false);
    expect(
      AdminResolveDataRequestSchema.safeParse({ status: 'REJECTED', resolutionNotes: 'Not eligible' })
        .success,
    ).toBe(true);
  });

  it('rejects a non-terminal status', () => {
    expect(AdminResolveDataRequestSchema.safeParse({ status: 'REQUESTED' }).success).toBe(false);
  });
});

describe('AdminListReportsQuerySchema', () => {
  it('defaults the page size and accepts a status filter', () => {
    expect(AdminListReportsQuerySchema.parse({}).limit).toBe(20);
    expect(AdminListReportsQuerySchema.parse({ status: 'OPEN' }).status).toBe('OPEN');
    expect(AdminListReportsQuerySchema.safeParse({ status: 'PENDING' }).success).toBe(false);
    expect(AdminListReportsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe('AdminReviewReportSchema', () => {
  it('pairs a dismissal with DISMISSED and needs no notes', () => {
    expect(AdminReviewReportSchema.safeParse({ status: 'DISMISSED', action: 'DISMISS' }).success).toBe(true);
  });

  it('requires notes to action', () => {
    expect(AdminReviewReportSchema.safeParse({ status: 'ACTIONED', action: 'SUSPEND' }).success).toBe(false);
    expect(
      AdminReviewReportSchema.safeParse({
        status: 'ACTIONED',
        action: 'SUSPEND',
        notes: 'Evidence of fraud',
      }).success,
    ).toBe(true);
  });

  it('refuses a status and action that disagree', () => {
    expect(
      AdminReviewReportSchema.safeParse({ status: 'DISMISSED', action: 'SUSPEND', notes: 'x' }).success,
    ).toBe(false);
    expect(
      AdminReviewReportSchema.safeParse({ status: 'ACTIONED', action: 'DISMISS', notes: 'x' }).success,
    ).toBe(false);
  });

  it('rejects a non-terminal status and an unknown action', () => {
    expect(AdminReviewReportSchema.safeParse({ status: 'OPEN', action: 'DISMISS' }).success).toBe(false);
    expect(
      AdminReviewReportSchema.safeParse({ status: 'ACTIONED', action: 'NUKE', notes: 'x' }).success,
    ).toBe(false);
  });
});

describe('admin MFA contracts', () => {
  it('accepts only a six-digit code', () => {
    expect(AdminMfaCodeSchema.parse('000123')).toBe('000123');
    expect(AdminMfaCodeSchema.safeParse('12345').success).toBe(false);
    expect(AdminMfaCodeSchema.safeParse('abcdef').success).toBe(false);
    expect(AdminMfaCodeSchema.safeParse('1234567').success).toBe(false);
  });

  it('distinguishes a challenge from a session in the login response', () => {
    const pair = {
      access_token: 'a',
      refresh_token: 'b',
      token_type: 'Bearer',
      expires_in: 900,
    };
    const challenge = { mfa_required: true, challenge_token: 'c', expires_in: 300 };

    expect(AdminLoginResponseSchema.safeParse(pair).success).toBe(true);
    expect(AdminLoginResponseSchema.safeParse(challenge).success).toBe(true);
    expect(AdminMfaChallengeSchema.safeParse(challenge).success).toBe(true);
    // A session is not a challenge, and a half-built challenge is neither.
    expect(AdminMfaChallengeSchema.safeParse(pair).success).toBe(false);
    expect(AdminLoginResponseSchema.safeParse({ mfa_required: true }).success).toBe(false);
  });

  it('requires the challenge token and a code to finish a login', () => {
    expect(
      AdminMfaVerifySchema.safeParse({ challenge_token: 'c', code: '123456' }).success,
    ).toBe(true);
    expect(AdminMfaVerifySchema.safeParse({ code: '123456' }).success).toBe(false);
    expect(AdminMfaVerifySchema.safeParse({ challenge_token: 'c', code: 'bad' }).success).toBe(false);
  });

  it('requires the enrollment token and a code to activate', () => {
    expect(
      AdminMfaActivateSchema.safeParse({ enrollment_token: 'e', code: '123456' }).success,
    ).toBe(true);
    expect(AdminMfaActivateSchema.safeParse({ code: '123456' }).success).toBe(false);
  });

  it('requires a current code to disable', () => {
    expect(AdminMfaDisableSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(AdminMfaDisableSchema.safeParse({}).success).toBe(false);
  });
});
