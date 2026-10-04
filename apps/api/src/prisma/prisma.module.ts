/**
 * PrismaModule / PrismaService.
 *
 * Prisma 7 removed `url` from the datasource block in schema.prisma. The
 * connection string now arrives at runtime through the @prisma/adapter-pg
 * driver adapter, so the pool is configured here rather than by the schema.
 */

import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
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
    // The pg pool connects lazily, so a resolved $connect() means the client is
    // usable, not that the server answered. Logging a connection here reads as
    // "database is up" during an outage. isHealthy() below does the real
    // round-trip, and the readiness endpoint is what reports the truth.
    this.logger.log('Database client initialised');
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

/**
 * The client is registered under both tokens.
 *
 * `design:paramtypes` records the *declared* constructor type, so a service
 * asking for `PrismaClient` resolves the token `PrismaClient`, not
 * `PrismaService` — even though `PrismaService` extends it. Registering only
 * the subclass therefore fails dependency resolution at runtime, in a way that
 * type-checking cannot catch and that surfaces only when the first service that
 * touches the database is instantiated.
 */
@Global()
@Module({
  providers: [PrismaService, { provide: PrismaClient, useExisting: PrismaService }],
  exports: [PrismaService, PrismaClient],
})
export class PrismaModule {}
