import { defineConfig, env } from 'prisma/config';
import { loadRootEnv } from './src/load-env';

// dotenv's bare `config()` reads `process.env` cwd-relative, and npm runs this
// script with the cwd set to `apps/api`, so it never sees the repository root
// `.env` that README documents. Loading is explicit and cwd-independent.
loadRootEnv();

/**
 * Prisma 7 configuration.
 *
 * The datasource URL moved out of schema.prisma in v7. It is declared here for
 * the CLI (migrate, db push, studio) and is passed to the client at runtime
 * through the @prisma/adapter-pg driver adapter — see src/prisma/prisma.service.ts.
 *
 * `process.env` is used rather than `env()` so that `prisma generate` still
 * works in CI, where no database is reachable and DATABASE_URL is unset. The
 * empty-string fallback keeps that command working when no `.env` is present.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `tsx`, not `node --experimental-strip-types`. The generated Prisma client
    // is TypeScript, and bare `node` runs the seed as ESM, which requires an
    // explicit file extension on every relative import. `tsx` resolves the
    // extensionless imports used throughout the source, so the seed can import
    // the same generated client and shared package as the application.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
