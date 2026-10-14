import { AuditService } from './audit.service';

/**
 * `AuditService` tests — section 32.
 *
 * The log is append-only, so the only thing this service can get wrong is what
 * it writes. These tests pin the defaults: an omitted actor or reason must land
 * as an explicit null rather than being dropped, because a missing `reason` on a
 * sensitive action is exactly the field an investigator later needs.
 */

function fakePrisma() {
  const created: Array<Record<string, unknown>> = [];
  return {
    created,
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return data;
      },
    },
  };
}

describe('AuditService.record', () => {
  it('records the action, resource and actor', async () => {
    const prisma = fakePrisma();
    const service = new AuditService(prisma as never);

    await service.record({
      actorAdminId: 'admin_1',
      action: 'user:change_category',
      resourceType: 'User',
      resourceId: 'user_1',
      reason: 'Boundary review',
    });

    expect(prisma.created).toHaveLength(1);
    expect(prisma.created[0]).toMatchObject({
      actorAdminId: 'admin_1',
      action: 'user:change_category',
      resourceType: 'User',
      resourceId: 'user_1',
      reason: 'Boundary review',
    });
  });

  it('defaults absent optional fields to null instead of omitting them', async () => {
    const prisma = fakePrisma();
    const service = new AuditService(prisma as never);

    await service.record({
      actorAdminId: 'admin_1',
      action: 'pricing:write',
      resourceType: 'PricingConfig',
      resourceId: 'pc_1',
    });

    expect(prisma.created[0]).toMatchObject({
      reason: null,
      ipHash: null,
      userAgent: null,
    });
  });

  it('stores a system action with no actor', async () => {
    const prisma = fakePrisma();
    const service = new AuditService(prisma as never);

    await service.record({
      action: 'system:expire-unlocks',
      resourceType: 'ContactUnlock',
      resourceId: 'unlock_1',
    });

    expect(prisma.created[0]).toMatchObject({
      actorAdminId: null,
      action: 'system:expire-unlocks',
    });
  });
});
