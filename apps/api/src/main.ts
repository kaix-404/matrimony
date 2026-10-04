import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import type { Env } from './config/env';
import { loadRootEnv } from './load-env';

async function bootstrap(): Promise<void> {
  loadRootEnv();
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
    // Section 40: the payment webhook is authenticated by an HMAC over the raw
    // request body, so the exact bytes Razorpay signed have to survive parsing.
    // Without this, `req.rawBody` is undefined, the signature check compares
    // nothing and every webhook is either rejected or — worse — accepted
    // against a re-serialised body that no longer matches.
    rawBody: true,
  });

  configureApp(app, app.get<Env>('ENV'));

  const env = app.get<Env>('ENV');
  await app.listen(env.API_PORT, '0.0.0.0');
  logger.log(`API listening on :${env.API_PORT}/${env.API_GLOBAL_PREFIX} [${env.NODE_ENV}]`);
}

void bootstrap();
