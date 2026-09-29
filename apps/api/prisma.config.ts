import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 configuration.
 *
 * The datasource URL moved out of schema.prisma in v7. It is declared here for
 * the CLI (migrate, db push, studio) and is passed to the client at runtime
 * through the @prisma/adapter-pg driver adapter — see src/prisma/prisma.service.ts.
 *
 * `process.env` is used rather than `env()` so that `prisma generate` still
 * works in CI, where no database is reachable and DATABASE_URL is unset.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --experimental-strip-types prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
