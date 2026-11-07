/**
 * Applies pending migrations, then exits - the first step of the container boot.
 *
 * Why a wrapper instead of `prisma migrate deploy` in the start command: the
 * failure that matters here is P3005, and Prisma reports it as a bare code whose
 * remedy is a one-time baseline. Run directly, that code reaches the deploy log
 * with no explanation, and the next person has to rediscover it. The wrapper
 * passes Prisma's output through unchanged and adds the part that says what to
 * do (see `migrate-guard.ts`).
 *
 * Runs from `dist/`, so it must not import anything the Nest application needs
 * at bootstrap - only Node built-ins and its sibling module.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { explainMigrateFailure } from './migrate-guard';

/** `apps/api`: the directory holding prisma.config.ts, so Prisma resolves the same config the CLI does. */
const API_DIR = resolve(__dirname, '..', '..');

/** The repository root in a checkout, and `/app` in the image; node_modules lives here. */
const ROOT_DIR = resolve(API_DIR, '..', '..');

/**
 * Locates the Prisma CLI entry file.
 *
 * Spawned as `node <cli>` rather than through `npm run` or the `.bin` shim: the
 * runtime image has no home directory for a `--system` user, and npm wants a
 * writable cache before it will even start a script. Both candidate locations
 * are checked because npm hoists to the root in the image but not always in a
 * checkout.
 */
function resolvePrismaCli(): string {
  for (const base of [ROOT_DIR, API_DIR]) {
    const pkgPath = join(base, 'node_modules', 'prisma', 'package.json');
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        bin?: string | Record<string, string>;
      };
      const relative = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.prisma;
      if (relative !== undefined) {
        return join(dirname(pkgPath), relative);
      }
    } catch {
      // Not installed here; try the next location.
    }
  }
  throw new Error('The Prisma CLI was not found in node_modules; the image is incomplete.');
}

function main(): void {
  const cli = resolvePrismaCli();
  process.stdout.write('[deploy] applying pending database migrations\n');

  const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], {
    cwd: API_DIR,
    encoding: 'utf8',
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);

  if (result.error !== undefined && result.error !== null) {
    console.error(`[deploy] could not run the Prisma CLI: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(explainMigrateFailure(output, result.status ?? 1));
    process.exit(1);
  }
}

main();
