import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../prisma/prisma-client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaClient) {}

  async listUsers(limit = 20, cursor?: string) {
    const take = Math.min(limit, 100);
    const items = await this.prisma.user.findMany({
      take: take + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, mobile: true, status: true, createdAt: true },
    });
    const hasMore = items.length > take;
    const users = hasMore ? items.slice(0, take) : items;
    const nextCursor = hasMore ? users[users.length - 1]?.id ?? null : null;
    return { users, nextCursor, hasMore };
  }
}
