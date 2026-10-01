import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { ClockModule } from './common/clock/clock.module';
import { HealthModule } from './health/health.module';
import type { Env } from './config/env';

/**
 * Section 41 requires rate limiting. The guard is registered here as a global
 * provider so it cannot be forgotten per controller: an endpoint that forgets
 * its own `@UseGuards(ThrottlerGuard)` would otherwise be silently unlimited.
 *
 * Limits are read from the environment rather than hard-coded so a deployment
 * can tighten them without a code change. `@SkipThrottle()` on the health
 * endpoints only works because this global guard exists — without it the
 * decorator is an inert annotation and the endpoint is throttled like any
 * other route (or, before this module, not throttled at all).
 */
@Module({
  imports: [
    ConfigModule,
    ClockModule,
    PrismaModule,
    HealthModule,
    ThrottlerModule.forRootAsync({
      inject: ['ENV'],
      useFactory: (env: Env) => ({
        throttlers: [
          {
            // Lifts any per-route @Throttle() overrides, so a route can be
            // more permissive than this only by saying so explicitly.
            name: 'default',
            // RATE_LIMIT_TTL is seconds; the throttler counts milliseconds.
            ttl: env.RATE_LIMIT_TTL * 1_000,
            limit: env.RATE_LIMIT_MAX,
          },
        ],
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
