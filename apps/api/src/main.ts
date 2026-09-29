import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env';

/**
 * Section 41 requires encryption in transit, request validation, rate limiting
 * and secure headers. Defaults here are chosen so that forgetting a setting
 * fails closed rather than open.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  const env = app.get<Env>('ENV');

  app.use(
    helmet({
      // The API serves JSON only; a restrictive CSP costs nothing.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: env.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  // Admin Dashboard origin(s) only. A wildcard here would let any site drive
  // authenticated admin requests (section 46: separate permission domains).
  if (env.API_CORS_ORIGINS.length > 0) {
    app.enableCors({
      origin: env.API_CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      maxAge: 600,
    });
  }

  app.setGlobalPrefix(env.API_GLOBAL_PREFIX);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, '0.0.0.0');
  logger.log(`API listening on :${env.API_PORT}/${env.API_GLOBAL_PREFIX} [${env.NODE_ENV}]`);
}

void bootstrap();
