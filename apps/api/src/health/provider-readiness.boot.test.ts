import { Test } from '@nestjs/testing';
import { ConsoleLogger, Logger, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { PrismaService } from '../prisma/prisma.module';
import type { Env } from '../config/env';
import { TEST_ENV } from '../testing/test-env';

/**
 * That the provider boot line is printed, and says the same thing readiness says.
 *
 * The line existed and was tested, but never *observed*: `app.boot.test.ts` calls
 * `Logger.overrideLogger(false)` before it boots, and the reporter's own suite
 * calls `onApplicationBootstrap()` by hand against a spy. Both would keep passing
 * if the reporter were dropped from the module graph or the hook stopped being
 * invoked — and the failure would be silent, because the line's whole job is to be
 * read days later in a deploy log.
 *
 * Getting there needed two things the earlier tests never noticed. `@nestjs/testing`
 * installs its own `TestingLogger` on every app it creates, so log output is
 * swallowed even when nobody asked for silence; and Nest 11's ConsoleLogger writes
 * to `process.stdout` directly, so this captures the stream rather than `console`.
 * With the production logger restored, this boots the real graph and reads what an
 * operator would see.
 */

describe('provider readiness at boot', () => {
  let app: INestApplication;
  let printed: string;

  beforeAll(async () => {
    const chunks: string[] = [];
    const collect = ((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    }) as never;
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(collect);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(collect);

    try {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider('ENV')
        .useValue({ ...TEST_ENV })
        .overrideProvider(PrismaService)
        .useValue({
          isHealthy: async (): Promise<boolean> => true,
          $connect: async (): Promise<void> => undefined,
        })
        .compile();

      app = moduleRef.createNestApplication();
      // `createNestApplication()` has just installed the testing logger, so this
      // has to come after it and before `init()`, which is when the boot hooks
      // run. Production reaches the same logger the other way: `NestFactory`
      // leaves the default ConsoleLogger in place because `main.ts` passes no
      // `logger` option.
      Logger.overrideLogger(new ConsoleLogger());
      configureApp(app, app.get<Env>('ENV'));
      await app.init();
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
      printed = chunks.join('');
    }
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('prints the provider line under the reporter context, with sms awaiting credentials', () => {
    expect(printed).toContain('[ProviderReadinessReporter]');
    expect(printed).toContain('Providers awaiting credentials:');
    // `sms` in that list is what tells an operator the OTP endpoint will answer
    // 503 before anybody tries to register.
    expect(printed).toMatch(/Providers awaiting credentials:[^.]*\bsms\b/);
  });

  it('reports the same sms state on the readiness route', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready');

    expect(response.body.checks.sms).toBe('down');
  });
});
