import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '../prisma/prisma-client';

/**
 * Writes to the append-only `AuditLog`.
 *
 * Section 32: the log is append-only, so this service exposes exactly one
 * method — `record`. There is no update or delete here because the application
 * has no path to either; adding one would defeat the point of the log.
 *
 * Sensitive actions (section 28 manual unlock grants, section 29 pricing
 * changes, section 25 category moves) must call `record` in the same request as
 * the change, which is why `reason` is a first-class field rather than something
 * buried in `newValue`: an audit row that cannot explain *why* an administrator
 * acted is not much of an audit row.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async record(entry: {
    actorAdminId?: string | null;
    action: string;
    resourceType: string;
    resourceId: string;
    previousValue?: Prisma.InputJsonValue | null;
    newValue?: Prisma.InputJsonValue | null;
    reason?: string | null;
    ipHash?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorAdminId: entry.actorAdminId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        previousValue: entry.previousValue ?? undefined,
        newValue: entry.newValue ?? undefined,
        reason: entry.reason ?? null,
        ipHash: entry.ipHash ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }
}
