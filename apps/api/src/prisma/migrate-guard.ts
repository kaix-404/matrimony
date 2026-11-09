/**
 * What to tell an operator when `prisma migrate deploy` refuses to run.
 *
 * P3005 is the one migration failure whose fix is not visible in Prisma's own
 * output. It means the database has tables but no `_prisma_migrations` history,
 * so Migrate stops rather than replaying every migration on top of a schema it
 * cannot prove it built. That is a one-time baseline, not a broken deploy and
 * not data loss - but "the database schema is not empty" reads like the latter
 * to anyone seeing it for the first time, so the message has to say which it is.
 *
 * Kept apart from the entry point so the wording can be tested without spawning
 * a process or reaching a database.
 */

/** Prisma's baselining walkthrough, printed with the failure so the fix travels with it. */
const BASELINE_DOCS = 'https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining';

/** Prisma's code for "the database schema is not empty". */
const SCHEMA_NOT_EMPTY = 'P3005';

/**
 * Prisma codes that mean "try again" rather than "this database is wrong".
 *
 * P1002 is the one that actually happened: `migrate deploy` takes a Postgres
 * advisory lock for its own duration with a ten-second timeout, so two deploys
 * overlapping — or one slow connect to a pooled database — abort a release that
 * had nothing wrong with it. P1001 and P1017 are the same shape: the database
 * was unreachable or the connection dropped. Dedicated by code rather than by
 * matching prose, because the wording is Prisma's to change.
 */
const TRANSIENT_CODES = ['P1001', 'P1002', 'P1017'];

/**
 * Whether a failed `migrate deploy` is worth another attempt.
 *
 * Deliberately narrow: P3005 (no migration history) and a failed migration are
 * not transient, and retrying them only delays an explanation the operator
 * needs. Everything else is treated as terminal.
 */
export function isTransientMigrateFailure(output: string): boolean {
  return TRANSIENT_CODES.some((code) => new RegExp(`\\b${code}\\b`).test(output));
}

/**
 * The operator-facing explanation for a failed `migrate deploy`.
 *
 * @param output Combined stdout and stderr of the Prisma command.
 * @param exitCode Its exit status, quoted back so the message matches the log.
 */
export function explainMigrateFailure(output: string, exitCode: number): string {
  const header = `prisma migrate deploy failed (exit code ${exitCode}); the API did not start.`;

  if (!output.includes(SCHEMA_NOT_EMPTY)) {
    // Name the code when there is one: "Prisma reported P1001" sends the reader
    // to the right page, where "see the output above" sends them to a wall of text.
    const code = /\bP\d{4}\b/.exec(output)?.[0];
    const pointer =
      code === undefined
        ? "Prisma's output above is the place to look."
        : `Prisma reported ${code}; its output above is the place to look.`;
    return `${header} ${pointer}`;
  }

  return [
    header,
    '',
    `${SCHEMA_NOT_EMPTY} means this database has tables but no migration history, so Prisma`,
    'will not run migrations against a schema it cannot prove it built. Nothing was changed:',
    'this check happens before the first migration executes, so there is no half-applied',
    'state to clean up.',
    '',
    'The API refuses to start in that state on purpose: serving traffic on a schema this',
    'release did not migrate is exactly the failure the step exists to prevent. Baseline the',
    'database once, against the same DATABASE_URL, and redeploy:',
    '',
    '  * If the schema was created with `prisma db push` or raw SQL, record what already',
    '    exists as a baseline migration (`prisma migrate diff` produces it from the current',
    '    schema) and mark that migration applied with',
    '        npx prisma migrate resolve --applied <baseline_migration_name>',
    '',
    '  * If the schema did come from these migrations and only the `_prisma_migrations`',
    '    table was lost, mark each migration directory applied, oldest first:',
    '        npx prisma migrate resolve --applied <migration_directory_name>',
    '',
    `Walkthrough, including the flags for this Prisma version: ${BASELINE_DOCS}`,
  ].join('\n');
}
