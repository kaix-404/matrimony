import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_METADATA_KEY } from './require-permission.decorator';
import type { AdminRequest } from './admin-request';

/**
 * `PermissionsGuard` tests — section 33.
 *
 * The guard is the one place that decides whether an authenticated admin may
 * perform an action, so the cases that matter are the refusals: a missing
 * grant, a role with no grants, and a request that reached the guard without an
 * authenticated principal. Each must throw rather than fall through, because a
 * guard that returns `true` on an error path is an access-control bug that no
 * happy-path test would catch.
 */

const grantsByRole: Record<string, string[]> = {
  ADMIN: ['user:read', 'profile:approve'],
  MODERATION_ADMIN: ['report:review', 'photo:review'],
  FINANCE_ADMIN: ['pricing:read'],
};

function fakePrisma() {
  let calls = 0;
  return {
    calls: () => calls,
    adminRolePermission: {
      findMany: async ({ where }: { where: { role: { slug: { in: string[] } } } }) => {
        calls += 1;
        const keys = new Set<string>();
        for (const role of where.role.slug.in) {
          for (const key of grantsByRole[role] ?? []) keys.add(key);
        }
        return [...keys].map((key) => ({ permission: { key } }));
      },
    },
  };
}

function fakeReflector(required: string[] | undefined): Reflector {
  return {
    getAllAndOverride: (key: string) => (key === PERMISSIONS_METADATA_KEY ? required : undefined),
  } as unknown as Reflector;
}

function contextFor(request: Partial<AdminRequest>): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function setup(required: string[] | undefined, request: Partial<AdminRequest>) {
  const prisma = fakePrisma();
  const guard = new PermissionsGuard(fakeReflector(required), prisma as never);
  return { guard, prisma, context: contextFor(request) };
}

describe('PermissionsGuard', () => {
  it('allows a handler with no required permissions without touching the database', async () => {
    const { guard, prisma, context } = setup(undefined, {});
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.calls()).toBe(0);
  });

  it('allows an admin holding the required permission through any role', async () => {
    const { guard, context } = setup(['report:review'], {
      admin: { id: 'a1', roles: ['MODERATION_ADMIN'] },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('refuses an admin who does not hold the required permission', async () => {
    const { guard, context } = setup(['user:change_category'], {
      admin: { id: 'a1', roles: ['ADMIN'] },
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('names the missing permission in the error, so the refusal is diagnosable', async () => {
    const { guard, context } = setup(['user:read', 'admin:manage'], {
      admin: { id: 'a1', roles: ['FINANCE_ADMIN'] },
    });
    await expect(guard.canActivate(context)).rejects.toThrow('admin:manage');
  });

  it('refuses a request that reached the guard unauthenticated', async () => {
    const { guard, context } = setup(['user:read'], {});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses an admin with no roles without querying for grants', async () => {
    const { guard, prisma, context } = setup(['user:read'], {
      admin: { id: 'a1', roles: [] },
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.calls()).toBe(0);
  });
});
