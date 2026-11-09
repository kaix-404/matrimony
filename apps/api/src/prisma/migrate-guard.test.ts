import { explainMigrateFailure, isTransientMigrateFailure } from './migrate-guard';

/**
 * Which failures are worth a second attempt.
 *
 * The case that matters is P1002: the advisory lock has a ten-second timeout, so
 * two deploys overlapping mark a perfectly good release as failed — which is how
 * a mobile-only commit appeared to break the API.
 */
describe('isTransientMigrateFailure', () => {
  it('retries a lock timeout', () => {
    const output = [
      'Error: P1002',
      '',
      'The database server was reached but timed out.',
      'Context: Timed out trying to acquire a postgres advisory lock',
    ].join('\n');

    expect(isTransientMigrateFailure(output)).toBe(true);
  });

  it('retries an unreachable or dropped connection', () => {
    expect(isTransientMigrateFailure('Error: P1001\n\nCan’t reach database server')).toBe(true);
    expect(isTransientMigrateFailure('Error: P1017\n\nServer has closed the connection')).toBe(
      true,
    );
  });

  it('does not retry an unmanaged schema, which needs a baseline', () => {
    expect(isTransientMigrateFailure('Error: P3005\n\nThe database schema is not empty')).toBe(
      false,
    );
  });

  it('does not retry a failed migration', () => {
    expect(isTransientMigrateFailure('Error: P3018\n\nA migration failed to apply')).toBe(false);
  });

  it('does not treat a missing code as transient', () => {
    expect(isTransientMigrateFailure('Something went wrong')).toBe(false);
  });
});

describe('explainMigrateFailure', () => {
  /** Trimmed from what Prisma 7 prints when it refuses an unmanaged schema. */
  const P3005_OUTPUT = [
    'Error: P3005',
    '',
    'The database schema is not empty. Read more about how to baseline an existing production database: https://pris.ly/d/migrate-baseline',
  ].join('\n');

  it('names P3005, says nothing was changed, and prints the baseline fix', () => {
    const message = explainMigrateFailure(P3005_OUTPUT, 1);

    expect(message).toContain('P3005');
    // The code alone reads like data loss to someone seeing it first; say it is not.
    expect(message).toContain('no migration history');
    expect(message).toContain('Nothing was changed');
    expect(message).toContain('migrate resolve --applied');
    expect(message).toContain('https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining');
    // It must be clear the container stopping is intended, not a crash to retry.
    expect(message).toContain('did not start');
  });

  it('does not offer baseline advice for an unrelated failure', () => {
    const message = explainMigrateFailure('Error: P1001\n\nCan\u2019t reach database server', 1);

    expect(message).toContain('P1001');
    expect(message).toContain('exit code 1');
    expect(message).not.toContain('migrate resolve');
    expect(message).not.toContain('_prisma_migrations');
  });

  it('quotes the exit code it was given', () => {
    expect(explainMigrateFailure('Error: P3018', 2)).toContain('exit code 2');
  });
});
