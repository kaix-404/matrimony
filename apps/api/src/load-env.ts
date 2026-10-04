import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads the repository `.env` for local runs.
 *
 * dotenv's bare `config()` resolves against `process.cwd()`, which is not
 * reliable here: npm runs workspace scripts with the cwd set to the package
 * directory, so both `nest start --watch` and the Prisma CLI execute inside
 * `apps/api` while the `.env` that `.env.example` documents lives at the
 * repository root. Searching upwards finds the same file from either location,
 * and from the repository root itself.
 *
 * Variables already present in `process.env` always win, so CI and container
 * deployments that inject real values are unaffected. A missing file is
 * ignored, which is what keeps `prisma generate` working in CI where no
 * `.env` exists and `DATABASE_URL` is unset.
 */
export function loadRootEnv(): void {
  let dir = process.cwd();

  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate });
      return;
    }

    const parent = resolve(dir, '..');
    if (parent === dir) {
      return;
    }
    dir = parent;
  }
}
