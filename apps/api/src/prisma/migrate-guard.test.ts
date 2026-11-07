import { explainMigrateFailure } from './migrate-guard';

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
