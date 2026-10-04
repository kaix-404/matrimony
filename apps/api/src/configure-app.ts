import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import type { Env } from './config/env';

/**
 * Transport-level hardening, separated from `main.ts` so it can be tested.
 *
 * Section 41 requires encryption in transit, rate limiting and secure headers.
 * Defaults are chosen so that forgetting a setting fails closed rather than
 * open.
 *
 * Request validation is applied per route with `ZodValidationPipe` and the
 * shared Zod contracts, not with a global `ValidationPipe`. Nest's
 * `ValidationPipe` needs `class-validator` at runtime and calls
 * `process.exit(1)` when it is absent, which is how the API used to die during
 * bootstrap instead of starting — a failure no unit test noticed, because none
 * of them call this function.
 */
export function configureApp(app: INestApplication, env: Env): void {
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
      // Idempotency-Key is listed for the payment endpoints (section 18): the
      // app must be able to retry an order without being charged twice, and an
      // unlisted request header fails CORS preflight in a browser or WebView.
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
      maxAge: 600,
    });
  }

  app.setGlobalPrefix(env.API_GLOBAL_PREFIX);
  app.enableShutdownHooks();
}
