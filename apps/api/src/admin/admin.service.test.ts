import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { FrozenClock } from '../common/clock/clock.service';
import { verifyPassword } from '../common/crypto/password';

/**
 * `AdminService` role-management tests — section 24.
 *
 * The interesting behaviour is not the happy path but the refusals that keep the
 * system administrable: an administrator cannot change their own roles, and the
 * last Super Admin cannot be revoked. Both are the kind of rule that, once
 * broken, is only discovered when nobody can grant a permission back.
 */

interface RoleSeed {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  permissions: Array<{
    permission: { key: string; resource: string; action: string; isSensitive: boolean };
  }>;
}

interface CreateAdminData {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  roles: {
    create: Array<{
      role: { connect: { id: string } };
      grantedByAdminId: string;
    }>;
  };
}

function setup() {
  const roles: RoleSeed[] = [
    {
      id: 'role_super',
      slug: 'SUPER_ADMIN',
      name: 'Super Admin',
      description: null,
      permissions: [
        { permission: { key: 'user:read', resource: 'user', action: 'read', isSensitive: false } },
      ],
    },
    {
      id: 'role_fin',
      slug: 'FINANCE_ADMIN',
      name: 'Finance Admin',
      description: 'payments',
      permissions: [],
    },
    {
      id: 'role_mod',
      slug: 'MODERATION_ADMIN',
      name: 'Moderation Admin',
      description: null,
      permissions: [],
    },
  ];

  const admins = [
    {
      id: 'admin_actor',
      email: 'actor@example.com',
      name: 'Actor',
      status: 'ACTIVE',
      mfaSecret: null as string | null,
      lastLoginAt: null as Date | null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      roles: [{ role: { slug: 'SUPER_ADMIN' } }],
    },
    {
      id: 'admin_target',
      email: 'target@example.com',
      name: 'Target',
      status: 'ACTIVE',
      mfaSecret: 'v1.iv.tag.ciphertext' as string | null,
      lastLoginAt: null as Date | null,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      roles: [{ role: { slug: 'FINANCE_ADMIN' } }],
    },
  ];

  const assignments: Array<{ adminId: string; roleId: string; grantedByAdminId?: string }> = [
    { adminId: 'admin_actor', roleId: 'role_super' },
    { adminId: 'admin_target', roleId: 'role_fin' },
  ];

  const categories = [
    { key: 'BELOW_2CR', isActive: true, isDiscoverable: true },
    { key: 'ABOVE_10CR', isActive: true, isDiscoverable: true },
    { key: 'PENDING_REVIEW', isActive: true, isDiscoverable: false },
  ];

  const users = [
    { id: 'user_1', networthCategory: 'BELOW_2CR', status: 'ACTIVE' as string },
    { id: 'user_2', networthCategory: 'BELOW_2CR', status: 'ACTIVE' as string },
  ];

  const reports = [
    {
      id: 'rep_1',
      status: 'OPEN' as string,
      description: 'Suspected fake profile',
      reviewNotes: null as string | null,
      actionTaken: null as string | null,
      resolvedAt: null as Date | null,
      resolvedByAdminId: null as string | null,
      createdAt: new Date('2026-10-10T00:00:00.000Z'),
      updatedAt: new Date('2026-10-10T00:00:00.000Z'),
      reporterId: 'user_1',
      reportedProfileId: 'profile_2',
      reportedUserId: 'user_2' as string | null,
      reason: { code: 'FAKE_PROFILE' },
    },
  ];

  const pricing: Array<{
    id: string;
    category: string;
    baseAmount: string;
    gstRate: string;
    version: number;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    note: string | null;
    createdByAdminId: string | null;
    createdAt: Date;
  }> = [
    {
      id: 'price_old',
      category: 'BELOW_2CR',
      baseAmount: '50.00',
      gstRate: '0.1800',
      version: 1,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
      note: null,
      createdByAdminId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ];

  const dataRequests = [
    {
      id: 'dr_1',
      userId: 'user_1',
      type: 'EXPORT',
      status: 'REQUESTED',
      requestedAt: new Date('2026-10-01T00:00:00.000Z'),
      dueAt: new Date('2026-10-31T00:00:00.000Z'),
      completedAt: null as Date | null,
      resolutionNotes: null as string | null,
      handledByAdminId: null as string | null,
    },
  ];

  const prisma = {
    user: {
      findMany: async () => [],
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.find((u) => u.id === where.id) ?? null,
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const user = users.find((u) => u.id === where.id)!;
        Object.assign(user, data);
        return user;
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; status?: { not: string } };
          data: Record<string, unknown>;
        }) => {
          const user = users.find((u) => u.id === where.id);
          if (!user) return { count: 0 };
          if (where.status?.not && user.status === where.status.not) return { count: 0 };
          Object.assign(user, data);
          return { count: 1 };
        },
      ),
    },
    netWorthCategoryRef: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        categories.find((c) => c.key === where.key) ?? null,
    },
    pricingConfig: {
      findFirst: async ({ where }: { where: { category: string; effectiveTo: null } }) =>
        pricing.find((p) => p.category === where.category && p.effectiveTo === null) ?? null,
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { effectiveTo: Date } }) => {
        const row = pricing.find((p) => p.id === where.id)!;
        row.effectiveTo = data.effectiveTo;
        return row;
      }),
      aggregate: async ({ where }: { where: { category: string } }) => ({
        _max: {
          version: pricing
            .filter((p) => p.category === where.category)
            .reduce((max, p) => Math.max(max, p.version), 0),
        },
      }),
      create: jest.fn(async ({ data }: { data: Omit<(typeof pricing)[number], 'id' | 'createdAt'> }) => {
        const row = {
          id: `price_${pricing.length + 1}`,
          ...data,
          createdAt: new Date('2026-10-14T12:00:00.000Z'),
        };
        pricing.push(row);
        return row;
      }),
    },
    profile: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === 'profile_1' ? { id: 'profile_1', userId: 'user_1' } : null,
    },
    adminGrantAudit: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'grant_1',
        ...data,
        createdAt: new Date('2026-10-14T12:00:00.000Z'),
      })),
    },
    dataRequest: {
      findMany: async ({ where }: { where?: { status?: string } } = {}) =>
        where?.status ? dataRequests.filter((r) => r.status === where.status) : dataRequests,
      findUnique: async ({ where }: { where: { id: string } }) =>
        dataRequests.find((r) => r.id === where.id) ?? null,
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = dataRequests.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    report: {
      findMany: async ({ where }: { where?: { status?: string } } = {}) =>
        where?.status ? reports.filter((r) => r.status === where.status) : reports,
      findUnique: async ({ where }: { where: { id: string } }) =>
        reports.find((r) => r.id === where.id) ?? null,
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = reports.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>): Promise<T> => fn(prisma),
    adminRole: {
      findMany: async ({ where }: { where?: { slug?: { in: string[] } } } = {}) => {
        const list = where?.slug?.in ? roles.filter((r) => where.slug!.in.includes(r.slug)) : roles;
        return list.map((r) => ({ ...r }));
      },
      findUnique: async ({ where }: { where: { slug?: string; id?: string } }) =>
        roles.find((r) => r.slug === where.slug || r.id === where.id) ?? null,
    },
    adminUser: {
      findMany: async () => admins,
      findUnique: async ({ where }: { where: { id: string } }) =>
        admins.find((a) => a.id === where.id) ?? null,
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const admin = admins.find((a) => a.id === where.id)!;
        Object.assign(admin, data);
        return admin;
      }),
      create: jest.fn(async ({ data }: { data: CreateAdminData }) => {
        const slugFor = (id: string) => roles.find((r) => r.id === id)!.slug;
        const roleSlugs: string[] = [];
        for (const entry of data.roles.create) {
          const slug = slugFor(entry.role.connect.id);
          roleSlugs.push(slug);
          assignments.push({ adminId: data.id, roleId: entry.role.connect.id, grantedByAdminId: entry.grantedByAdminId });
        }
        return {
          id: data.id,
          email: data.email,
          name: data.name,
          status: 'ACTIVE',
          lastLoginAt: null,
          createdAt: new Date('2026-10-14T00:00:00.000Z'),
          roles: roleSlugs.map((slug) => ({ role: { slug } })),
        };
      }),
    },
    adminRoleAssignment: {
      findUnique: async ({ where }: { where: { adminId_roleId: { adminId: string; roleId: string } } }) =>
        assignments.find(
          (a) =>
            a.adminId === where.adminId_roleId.adminId && a.roleId === where.adminId_roleId.roleId,
        ) ?? null,
      create: jest.fn(async ({ data }: { data: { adminId: string; roleId: string } }) => {
        assignments.push(data);
        return data;
      }),
      deleteMany: async ({ where }: { where: { adminId: string; roleId: string } }) => {
        let count = 0;
        for (let i = assignments.length - 1; i >= 0; i -= 1) {
          if (assignments[i]!.adminId === where.adminId && assignments[i]!.roleId === where.roleId) {
            assignments.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      },
      count: async ({ where }: { where: { roleId: string } }) =>
        assignments.filter((a) => a.roleId === where.roleId).length,
    },
  };

  const audit = { record: jest.fn(async () => undefined) };
  const clock = new FrozenClock(new Date('2026-10-14T12:00:00.000Z'));
  const service = new AdminService(prisma as never, audit as never, clock);

  return { service, prisma, audit, admins, assignments, users, pricing, dataRequests, reports };
}

describe('AdminService.listRoles', () => {
  it('projects each role with the permission keys it grants', async () => {
    const { service } = setup();
    const roles = await service.listRoles();

    expect(roles.map((r) => r.slug)).toEqual(['SUPER_ADMIN', 'FINANCE_ADMIN', 'MODERATION_ADMIN']);
    const superAdmin = roles.find((r) => r.slug === 'SUPER_ADMIN')!;
    expect(superAdmin.permissions).toEqual([
      { key: 'user:read', resource: 'user', action: 'read', sensitive: false },
    ]);
  });
});

describe('AdminService.listAdmins', () => {
  it('maps each administrator to the view, without a password hash', async () => {
    const { service } = setup();
    const { admins, hasMore, nextCursor } = await service.listAdmins();

    expect(hasMore).toBe(false);
    expect(nextCursor).toBeNull();
    expect(admins[0]).toMatchObject({
      id: 'admin_actor',
      email: 'actor@example.com',
      roles: ['SUPER_ADMIN'],
      lastLoginAt: null,
      mfaEnabled: false,
    });
    expect(admins[1]).toMatchObject({ id: 'admin_target', mfaEnabled: true });
    expect(admins[0]!.createdAt).toBe('2026-01-01T00:00:00.000Z');
    // Neither the password hash nor the raw MFA secret may reach the view.
    expect(JSON.stringify(admins)).not.toContain('passwordHash');
    expect(JSON.stringify(admins)).not.toContain('mfaSecret');
  });
});

describe('AdminService.createAdmin', () => {
  it('hashes the password, grants roles and audits the creation', async () => {
    const { service, prisma, audit, assignments } = setup();

    const created = await service.createAdmin(
      { email: 'new@example.com', name: 'New', password: 'a-strong-password', roles: ['FINANCE_ADMIN'] },
      'admin_actor',
    );

    expect(created.roles).toEqual(['FINANCE_ADMIN']);
    const storedHash = prisma.adminUser.create.mock.calls[0]![0].data.passwordHash as string;
    expect(storedHash).not.toBe('a-strong-password');
    expect(verifyPassword('a-strong-password', storedHash)).toBe(true);
    expect(assignments.some((a) => a.adminId === created.id && a.roleId === 'role_fin')).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin:create', resourceId: created.id }),
    );
  });

  it('rejects an unknown role before creating anything', async () => {
    const { service, prisma } = setup();

    await expect(
      service.createAdmin(
        { email: 'new@example.com', name: 'New', password: 'a-strong-password', roles: ['SUPER_ADMIN', 'ADMIN'] },
        'admin_actor',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.adminUser.create).not.toHaveBeenCalled();
  });

  it('turns a duplicate email into a conflict rather than a 500', async () => {
    const { service, prisma } = setup();
    prisma.adminUser.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      service.createAdmin(
        { email: 'actor@example.com', name: 'New', password: 'a-strong-password', roles: ['FINANCE_ADMIN'] },
        'admin_actor',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AdminService.assignRole', () => {
  it('refuses to change the acting administrator’s own roles', async () => {
    const { service, prisma, audit } = setup();

    await expect(service.assignRole('admin_actor', 'FINANCE_ADMIN', 'admin_actor')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.adminRoleAssignment.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('grants the role and audits it', async () => {
    const { service, assignments, audit } = setup();

    await service.assignRole('admin_target', 'MODERATION_ADMIN', 'admin_actor');

    expect(assignments.some((a) => a.adminId === 'admin_target' && a.roleId === 'role_mod')).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin:role:grant', resourceId: 'admin_target' }),
    );
  });

  it('is idempotent: re-granting does not write or audit again', async () => {
    const { service, prisma, audit } = setup();

    await service.assignRole('admin_target', 'FINANCE_ADMIN', 'admin_actor');

    expect(prisma.adminRoleAssignment.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects a role that is not in the catalogue', async () => {
    const { service } = setup();
    await expect(service.assignRole('admin_target', 'ADMIN', 'admin_actor')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('reports a missing administrator', async () => {
    const { service } = setup();
    await expect(service.assignRole('nobody', 'FINANCE_ADMIN', 'admin_actor')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AdminService.revokeRole', () => {
  it('refuses to change the acting administrator’s own roles', async () => {
    const { service } = setup();
    await expect(service.revokeRole('admin_actor', 'SUPER_ADMIN', 'admin_actor')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses to revoke the last Super Admin', async () => {
    const { service, assignments } = setup();
    await expect(service.revokeRole('admin_target', 'SUPER_ADMIN', 'admin_actor')).rejects.toThrow(
      'last Super Admin',
    );
    // Nothing was removed.
    expect(assignments.some((a) => a.roleId === 'role_super')).toBe(true);
  });

  it('revokes a non-final role and audits it', async () => {
    const { service, assignments, audit } = setup();

    await service.revokeRole('admin_target', 'FINANCE_ADMIN', 'admin_actor');

    expect(assignments.some((a) => a.adminId === 'admin_target' && a.roleId === 'role_fin')).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin:role:revoke', resourceId: 'admin_target' }),
    );
  });

  it('reports when the administrator does not hold the role', async () => {
    const { service } = setup();
    await expect(service.revokeRole('admin_actor', 'FINANCE_ADMIN', 'admin_target')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AdminService.resetMfa', () => {
  it('clears another administrator’s second factor and audits it', async () => {
    const { service, audit, admins } = setup();

    const result = await service.resetMfa('admin_target', 'admin_actor');

    expect(result.mfaEnabled).toBe(false);
    expect(admins.find((a) => a.id === 'admin_target')!.mfaSecret).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin:mfa:reset', resourceId: 'admin_target' }),
    );
  });

  it('refuses to reset the acting administrator’s own MFA', async () => {
    const { service, audit } = setup();

    await expect(service.resetMfa('admin_actor', 'admin_actor')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('reports a missing administrator', async () => {
    const { service } = setup();
    await expect(service.resetMfa('nobody', 'admin_actor')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports when MFA is not enabled for the target', async () => {
    const { service } = setup();
    await expect(service.resetMfa('admin_actor', 'admin_target')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AdminService.changeCategory', () => {
  it('moves the user, clears the review note and audits with the reason', async () => {
    const { service, prisma, audit } = setup();

    const result = await service.changeCategory(
      'user_1',
      { category: 'ABOVE_10CR', reason: 'Documents supplied' },
      'admin_actor',
    );

    expect(result).toEqual({
      userId: 'user_1',
      previousCategory: 'BELOW_2CR',
      networthCategory: 'ABOVE_10CR',
      changedAt: '2026-10-14T12:00:00.000Z',
      changedByAdminId: 'admin_actor',
    });
    expect(prisma.user.update.mock.calls[0]![0].data).toMatchObject({
      networthCategory: 'ABOVE_10CR',
      categoryReviewNote: null,
      categoryChangedByAdminId: 'admin_actor',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user:category:change',
        resourceId: 'user_1',
        reason: 'Documents supplied',
      }),
    );
  });

  it('refuses a category that is not a real, discoverable band', async () => {
    const { service, prisma } = setup();

    await expect(
      service.changeCategory('user_1', { category: 'PENDING_REVIEW', reason: 'x' }, 'admin_actor'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses a move to the category the user already holds', async () => {
    const { service } = setup();
    await expect(
      service.changeCategory('user_1', { category: 'BELOW_2CR', reason: 'x' }, 'admin_actor'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports a missing user', async () => {
    const { service } = setup();
    await expect(
      service.changeCategory('nobody', { category: 'ABOVE_10CR', reason: 'x' }, 'admin_actor'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AdminService.publishPricing', () => {
  it('closes the active version and opens the next in one transaction', async () => {
    const { service, prisma, audit, pricing } = setup();

    const result = await service.publishPricing(
      { category: 'BELOW_2CR', baseAmount: '99.00', gstPercent: 18 },
      'admin_actor',
    );

    expect(prisma.pricingConfig.update).toHaveBeenCalledWith({
      where: { id: 'price_old' },
      data: { effectiveTo: new Date('2026-10-14T12:00:00.000Z') },
    });
    expect(prisma.pricingConfig.create.mock.calls[0]![0].data).toMatchObject({
      category: 'BELOW_2CR',
      baseAmount: '99.00',
      gstRate: '0.1800',
      version: 2,
      createdByAdminId: 'admin_actor',
    });
    expect(result.version).toBe(2);
    expect(result.gstRate).toBe('0.1800');
    expect(pricing.find((p) => p.id === 'price_old')!.effectiveTo).toEqual(
      new Date('2026-10-14T12:00:00.000Z'),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pricing:publish', resourceType: 'PricingConfig' }),
    );
  });

  it('rejects an unknown category before touching pricing', async () => {
    const { service, prisma } = setup();

    await expect(
      service.publishPricing({ category: 'NOPE', baseAmount: '1.00', gstPercent: 18 }, 'admin_actor'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.pricingConfig.create).not.toHaveBeenCalled();
  });
});

describe('AdminService.grantUnlock', () => {
  it('records the grant, resolves the owner from the profile and audits it', async () => {
    const { service, prisma, audit } = setup();

    const result = await service.grantUnlock({ profileId: 'profile_1', reason: 'Goodwill' }, 'admin_actor');

    expect(prisma.adminGrantAudit.create).toHaveBeenCalledWith({
      data: {
        adminId: 'admin_actor',
        targetUserId: 'user_1',
        targetProfileId: 'profile_1',
        reason: 'Goodwill',
      },
    });
    expect(result).toEqual({
      profileId: 'profile_1',
      targetUserId: 'user_1',
      grantedAt: '2026-10-14T12:00:00.000Z',
      expiresAt: '2026-10-15T12:00:00.000Z',
      reason: 'Goodwill',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'unlock:grant', resourceId: 'profile_1', reason: 'Goodwill' }),
    );
  });

  it('reports a missing profile', async () => {
    const { service } = setup();
    await expect(
      service.grantUnlock({ profileId: 'nobody', reason: 'x' }, 'admin_actor'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AdminService.listDataRequests', () => {
  it('lists requests and filters by status', async () => {
    const { service } = setup();

    const all = await service.listDataRequests();
    expect(all.hasMore).toBe(false);
    expect(all.requests[0]).toMatchObject({ id: 'dr_1', type: 'EXPORT', status: 'REQUESTED' });

    const none = await service.listDataRequests(20, undefined, 'COMPLETED');
    expect(none.requests).toEqual([]);
  });
});

describe('AdminService.resolveDataRequest', () => {
  it('completes a request and audits it', async () => {
    const { service, audit } = setup();

    const result = await service.resolveDataRequest('dr_1', { status: 'COMPLETED' }, 'admin_actor');

    expect(result).toMatchObject({
      status: 'COMPLETED',
      completedAt: '2026-10-14T12:00:00.000Z',
      handledByAdminId: 'admin_actor',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'data_request:resolve', resourceId: 'dr_1' }),
    );
  });

  it('refuses to resolve a request twice', async () => {
    const { service } = setup();
    await service.resolveDataRequest('dr_1', { status: 'COMPLETED' }, 'admin_actor');

    await expect(
      service.resolveDataRequest('dr_1', { status: 'REJECTED', resolutionNotes: 'no' }, 'admin_actor'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reports a missing request', async () => {
    const { service } = setup();
    await expect(
      service.resolveDataRequest('nobody', { status: 'COMPLETED' }, 'admin_actor'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AdminService.listReports', () => {
  it('maps the queue and does not leak raw column names', async () => {
    const { service } = setup();

    const { reports, hasMore, nextCursor } = await service.listReports();

    expect(hasMore).toBe(false);
    expect(nextCursor).toBeNull();
    expect(reports[0]).toMatchObject({
      id: 'rep_1',
      status: 'OPEN',
      reason_code: 'FAKE_PROFILE',
      reporter_user_id: 'user_1',
      reported_user_id: 'user_2',
    });
    // The view is snake_case only; a raw column name would mean a spread leaked in.
    expect(JSON.stringify(reports)).not.toContain('reportedUserId');
    expect(JSON.stringify(reports)).not.toContain('reporterId');
  });

  it('filters by status', async () => {
    const { service } = setup();
    const { reports } = await service.listReports(20, undefined, 'DISMISSED');
    expect(reports).toEqual([]);
  });
});

describe('AdminService.getReport', () => {
  it('returns one report', async () => {
    const { service } = setup();
    await expect(service.getReport('rep_1')).resolves.toMatchObject({ id: 'rep_1', status: 'OPEN' });
  });

  it('reports a missing report', async () => {
    const { service } = setup();
    await expect(service.getReport('nobody')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AdminService.reviewReport', () => {
  it('dismisses a report, records the decision and audits it', async () => {
    const { service, audit, users, reports } = setup();

    const result = await service.reviewReport(
      'rep_1',
      { status: 'DISMISSED', action: 'DISMISS' },
      'admin_actor',
    );

    expect(result).toMatchObject({
      status: 'DISMISSED',
      action_taken: 'DISMISS',
      resolved_at: '2026-10-14T12:00:00.000Z',
      resolved_by_admin_id: 'admin_actor',
    });
    // A dismissal is not a sanction: the reported account is untouched.
    expect(users.find((u) => u.id === 'user_2')!.status).toBe('ACTIVE');
    expect(reports[0]!.status).toBe('DISMISSED');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'report:review', resourceId: 'rep_1' }),
    );
  });

  it('suspends the reported account on SUSPEND', async () => {
    const { service, audit, users } = setup();

    const result = await service.reviewReport(
      'rep_1',
      { status: 'ACTIONED', action: 'SUSPEND', notes: 'Confirmed fake profile' },
      'admin_actor',
    );

    expect(result).toMatchObject({ status: 'ACTIONED', action_taken: 'SUSPEND' });
    expect(users.find((u) => u.id === 'user_2')!.status).toBe('SUSPENDED');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'report:review',
        newValue: expect.objectContaining({ suspended: true }),
      }),
    );
  });

  it('records a warning without suspending anyone', async () => {
    const { service, users } = setup();

    await service.reviewReport(
      'rep_1',
      { status: 'ACTIONED', action: 'WARN', notes: 'First warning' },
      'admin_actor',
    );

    expect(users.find((u) => u.id === 'user_2')!.status).toBe('ACTIVE');
  });

  it('leaves an already-deleted account deleted rather than resurrecting it', async () => {
    const { service, audit, users } = setup();
    users.find((u) => u.id === 'user_2')!.status = 'DELETED';

    await service.reviewReport(
      'rep_1',
      { status: 'ACTIONED', action: 'SUSPEND', notes: 'Confirmed fake profile' },
      'admin_actor',
    );

    expect(users.find((u) => u.id === 'user_2')!.status).toBe('DELETED');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'report:review',
        newValue: expect.objectContaining({ suspended: false }),
      }),
    );
  });

  it('refuses to resolve a report twice', async () => {
    const { service } = setup();
    await service.reviewReport('rep_1', { status: 'DISMISSED', action: 'DISMISS' }, 'admin_actor');

    await expect(
      service.reviewReport(
        'rep_1',
        { status: 'ACTIONED', action: 'SUSPEND', notes: 'changed my mind' },
        'admin_actor',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reports a missing report', async () => {
    const { service } = setup();
    await expect(
      service.reviewReport('nobody', { status: 'DISMISSED', action: 'DISMISS' }, 'admin_actor'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
