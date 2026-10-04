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
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  configureApp(app, app.get<Env>('ENV'));

  const env = app.get<Env>('ENV');
  await app.listen(env.API_PORT, '0.0.0.0');
  logger.log(`API listening on :${env.API_PORT}/${env.API_GLOBAL_PREFIX} [${env.NODE_ENV}]`);
}

void bootstrap();
