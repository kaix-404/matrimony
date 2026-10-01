import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { ConfigModule } from './config/config.module';
import { ClockModule } from './common/clock/clock.module';
import { HealthModule } from './health/health.module';
import { PrismaModule, PrismaService } from './prisma/prisma.module';

/**
 * Stands in for a real business route, which the API does not have yet. It
 * exists so the throttle can be observed actually rejecting traffic rather than
 * merely being configured.
 */
@Controller('probe')
class ProbeController {
  @Get()
  probe(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

const LIMIT = 3;
const TTL_MS = 60_000;

/**
 * The real environment schema is enforced, so a test that boots a module has to
 * supply a complete environment. These are throwaway values that satisfy the
 * required-field checks; nothing here talks to a real service.
 */
const TEST_ENV = {
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'test-access-secret-not-used-for-signing',
  JWT_REFRESH_SECRET: 'test-refresh-secret-not-used-for-signing',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'test-bucket',
  S3_ACCESS_KEY: 'test-access-key',
  S3_SECRET_KEY: 'test-secret-key',
} as const;

async function buildApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule,
      ClockModule,
      HealthModule,
      ProbeModule,
      // PrismaModule is @Global, so importing it is what makes the
      // PrismaService override below apply to HealthController as well.
      PrismaModule,
      ThrottlerModule.forRoot({
        throttlers: [{ name: 'default', ttl: TTL_MS, limit: LIMIT }],
      }),
    ],
    providers: [
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: 'ENV', useValue: { ...TEST_ENV, RATE_LIMIT_TTL: 60, RATE_LIMIT_MAX: LIMIT } },
    ],
  })
    .overrideProvider('ENV')
    .useValue({ ...TEST_ENV, RATE_LIMIT_TTL: 60, RATE_LIMIT_MAX: LIMIT })
    .overrideProvider(PrismaService)
    .useValue({ isHealthy: async (): Promise<boolean> => true })
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

/**
 * Section 41 requires rate limiting. The guard is registered globally in
 * AppModule, which matters for two reasons:
 *
 *  - forgetting `@UseGuards(ThrottlerGuard)` on a new controller would
 *    otherwise leave that route silently unlimited, and
 *  - `@SkipThrottle()` on the health endpoints only works because a global
 *    guard exists to skip.
 */
describe('rate limiting (section 41)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('rejects an ordinary route once the limit is exceeded', async () => {
    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      const allowed = await request(app.getHttpServer()).get('/api/probe');
      expect(allowed.status).toBe(200);
    }

    const blocked = await request(app.getHttpServer()).get('/api/probe');
    expect(blocked.status).toBe(429);
  });

  it('exempts health endpoints so monitoring cannot lock itself out', async () => {
    // Well beyond the limit. If @SkipThrottle() were inert these would start
    // returning 429 and a healthy instance would be declared unhealthy.
    for (let attempt = 0; attempt < LIMIT + 5; attempt += 1) {
      const response = await request(app.getHttpServer()).get('/api/health/ready');
      expect(response.status).toBe(200);
    }
  });

  it('keeps liveness answerable under repeated polling', async () => {
    for (let attempt = 0; attempt < LIMIT + 5; attempt += 1) {
      const response = await request(app.getHttpServer()).get('/api/health/live');
      expect(response.status).toBe(200);
    }
  });
});
