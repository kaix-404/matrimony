import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../prisma/prisma-client';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    userId?: string;
    event: string;
    channel: 'PUSH' | 'SMS' | 'EMAIL' | 'IN_APP';
    title: string;
    body: string;
    payload?: unknown;
    isCritical?: boolean;
    createdByAdminId?: string;
  }) {
    return this.prisma.notification.create({
      data: {
        userId: data.userId ?? null,
        event: data.event,
        channel: data.channel,
        status: 'PENDING',
        title: data.title,
        body: data.body,
        payload: data.payload ?? undefined,
        isCritical: data.isCritical ?? false,
        createdByAdminId: data.createdByAdminId ?? null,
      },
    });
  }

  async markSent(id: string, providerMessageId?: string) {
    return this.prisma.notification.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        providerMessageId: providerMessageId ?? null,
        attempts: { increment: 1 },
      },
    });
  }

  async markFailed(id: string, lastError: string) {
    return this.prisma.notification.update({
      where: { id },
      data: {
        status: 'FAILED',
        lastError,
        attempts: { increment: 1 },
      },
    });
  }

  async markSuppressed(id: string, reason: string) {
    return this.prisma.notification.update({
      where: { id },
      data: {
        status: 'SUPPRESSED',
        lastError: reason,
      },
    });
  }

  async listForUser(userId: string, limit: number, cursor?: string) {
    const take = Math.min(limit, 100);
    const where = { userId };
    const items = await this.prisma.notification.findMany({
      where,
      take: take + 1,
      orderBy: { createdAt: 'desc' },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
    });
    const hasMore = items.length > take;
    const notifications = hasMore ? items.slice(0, take) : items;
    const nextCursor = hasMore ? notifications[notifications.length - 1]?.id ?? null : null;
    return { notifications, nextCursor, hasMore };
  }
}
