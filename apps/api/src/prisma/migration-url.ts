/**
 * Which connection string `prisma migrate deploy` should use.
 *
 * Migrations take a session-scoped Postgres advisory lock for their whole
 * duration. Neon's pooled endpoint (the host carrying `-pooler`) is a PgBouncer
 * in transaction mode: it hands the backend connection back after every
 * statement, so the unlock can run on a different backend from the lock. The
 * lock then stays held until the pooler drops that connection, and the next
 * deploy waits ten seconds, fails with P1002, and marks a good release as
 * failed. That is exactly what happened on 2026-11-09.
 *
 * Neon publishes a direct endpoint on the same host without `-pooler`, which is
 * what migrations should use. The application itself keeps using the pooled URL,
 * because that is what pooling is for.
 *
 * Nothing here guesses beyond that one documented rewrite: an unrecognised URL
 * is returned untouched, since inventing a hostname would turn a lock timeout
 * into a connection failure.
 */

/** Only the two variables this module reads, so it stays testable without a process. */
export interface MigrationUrlEnv {
  DATABASE_URL?: string;
  DATABASE_DIRECT_URL?: string;
}

/**
 * Candidate URLs for the migration step, most preferred first.
 *
 * The direct endpoint is tried first and the pooled one is kept as a fallback:
 * if the host only exposes a pooler, a failed migration is worse than the lock
 * risk it is trying to avoid.
 */
export function migrationDatabaseUrls(env: MigrationUrlEnv): string[] {
  const pooled = env.DATABASE_URL?.trim() ?? '';
  const explicitDirect = env.DATABASE_DIRECT_URL?.trim() ?? '';

  const direct = explicitDirect !== '' ? explicitDirect : pooled === '' ? '' : unpooled(pooled);

  return [...new Set([direct, pooled])].filter((url) => url !== '');
}

/** Neon's direct endpoint: the same host with the `-pooler` label removed. */
function unpooled(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('-pooler.')) return url;
    parsed.hostname = parsed.hostname.replace('-pooler.', '.');
    return parsed.toString();
  } catch {
    // Not a URL Prisma could use either; let it try and report its own error.
    return url;
  }
}

/** The host part only, for a log line that must not carry credentials. */
export function databaseHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}
