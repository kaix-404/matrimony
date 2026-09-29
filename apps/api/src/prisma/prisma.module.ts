/**
 * PrismaModule / PrismaService.
 *
 * Prisma 7 removed `url` from the datasource block in schema.prisma. The
 * connection string now arrives at runtime through the @prisma/adapter-pg
 * driver adapter, so the pool is configured here rather than by the schema.
 */

import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './prisma-client';
import type { Env } from '../config/env';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject('ENV') env: Env) {
    const adapter = new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: 10,
      // Timestamps are always produced by the server, so the connection must
      // never trust a client-supplied clock.
      options: '-c timezone=UTC',
    });
    super({
      adapter,
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Liveness plus a real round-trip. A pool that is up but cannot execute a
   * query is not healthy, and reporting otherwise hides outages from the
   * load balancer.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed', error as Error);
      return false;
    }
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
