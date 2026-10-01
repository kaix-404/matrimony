import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Logger, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { PrismaService } from './prisma/prisma.module';
import { loadEnv, type Env } from './config/env';

/**
 * Boots the real application graph.
 *
 * This exists because the API used to fail at startup — `main.ts` registered
 * Nest's `ValidationPipe`, which calls `process.exit(1)` when `class-validator`
 * is missing — while every other test suite passed, because none of them
 * assemble the full module graph. A smoke test that mirrors production
 * bootstrap is the only thing that catches a failure in wiring.
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
  API_GLOBAL_PREFIX: 'api',
  API_CORS_ORIGINS: [],
  RATE_LIMIT_TTL: 60,
  RATE_LIMIT_MAX: 100,
} as const;

describe('application bootstrap (section 41)', () => {
  let app: INestApplication;
  let env: Env;

  beforeAll(async () => {
    // Nest's own logging would otherwise fill the test output.
    Logger.overrideLogger(false);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider('ENV')
      .useValue({ ...TEST_ENV })
      .overrideProvider(PrismaService)
      .useValue({ isHealthy: async (): Promise<boolean> => true, $connect: async (): Promise<void> => undefined })
      .compile();

    app = moduleRef.createNestApplication();
    env = app.get<Env>('ENV');
    configureApp(app, env);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('starts without exiting the process', () => {
    // If a dependency were missing the way class-validator was, Nest would have
    // already called process.exit(1) during configureApp/app.init().
    expect(app).toBeDefined();
  });

  it('serves liveness under the global prefix', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/live');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('sets the hardening headers required by section 41', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/live');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('reports server time in readiness, never a client clock', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    // Clock drift is a new readiness signal; an unexpected value here means
    // ClockDriftGuard is not wired into the health report.
    expect(response.body.checks.clock).toBe('up');
    expect(Number.isNaN(Date.parse(response.body.serverTime))).toBe(false);
  });

  it('refuses to boot on an invalid environment', () => {
    // Fails closed: a deployment missing secrets must not start half-working.
    expect(() => loadEnv({ ...TEST_ENV, JWT_ACCESS_SECRET: undefined } as Record<string, unknown>)).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });
});
