import { databaseHost, migrationDatabaseUrls } from './migration-url';

/**
 * Neon's pooler cannot hold the migration advisory lock, so migrations must run
 * against the direct endpoint. Getting this wrong is not visible in a unit test
 * of the migration itself — it shows up as P1002 in a deploy log — which is why
 * the URL choice is a pure function with cases here.
 */
describe('migrationDatabaseUrls', () => {
  const pooled =
    'postgresql://user:pass@ep-frosty-frog-a15pkdy4-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

  it('prefers the direct endpoint when the URL is pooled', () => {
    const [first, ...rest] = migrationDatabaseUrls({ DATABASE_URL: pooled });

    expect(first).toBe(
      'postgresql://user:pass@ep-frosty-frog-a15pkdy4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
    );
    // The pooled URL stays available as a fallback.
    expect(rest).toEqual([pooled]);
  });

  it('leaves an unpooled URL alone and does not duplicate it', () => {
    const direct = 'postgresql://user:pass@db.internal:5432/matrimony';

    expect(migrationDatabaseUrls({ DATABASE_URL: direct })).toEqual([direct]);
  });

  it('uses DATABASE_DIRECT_URL verbatim when one is configured', () => {
    const direct = 'postgresql://user:pass@direct.internal:5432/matrimony';

    expect(migrationDatabaseUrls({ DATABASE_URL: pooled, DATABASE_DIRECT_URL: direct })).toEqual([
      direct,
      pooled,
    ]);
  });

  it('does not rewrite a pooler that is not part of the host name', () => {
    // `-pooler` inside a path or a parameter must not be touched.
    const url = 'postgresql://user:pass@db.internal:5432/my-pooler.db';

    expect(migrationDatabaseUrls({ DATABASE_URL: url })).toEqual([url]);
  });

  it('returns nothing when no URL is configured', () => {
    expect(migrationDatabaseUrls({})).toEqual([]);
    expect(migrationDatabaseUrls({ DATABASE_URL: '   ' })).toEqual([]);
  });
});

describe('databaseHost', () => {
  it('reports the host without credentials', () => {
    expect(databaseHost('postgresql://user:secret@db.example.com:5432/x')).toBe('db.example.com');
  });

  it('degrades instead of throwing on junk', () => {
    expect(databaseHost('not a url')).toBe('(unparseable DATABASE_URL)');
  });
});
