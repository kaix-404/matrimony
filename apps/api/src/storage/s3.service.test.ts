import { mergeCorsRules } from './s3.service';

/**
 * The bucket's browser-upload rule.
 *
 * A presigned PUT is still a cross-origin request, so the bucket has to name the
 * site that uploads. The rule is written by the API at boot from
 * `S3_CORS_ORIGINS`, which means it must be idempotent: a deploy that re-adds it
 * cannot be allowed to accumulate duplicate rules, and rules this service did
 * not write must survive.
 */
describe('mergeCorsRules', () => {
  it('adds an upload rule for the given origins', () => {
    const rules = mergeCorsRules(
      [],
      ['https://networth-matrimony.onrender.com', 'http://localhost:8081'],
    );

    expect(rules).toHaveLength(1);
    expect(rules[0].AllowedOrigins).toEqual([
      'https://networth-matrimony.onrender.com',
      'http://localhost:8081',
    ]);
    // A PUT is the upload; GET/HEAD let the same rule serve reads.
    expect(rules[0].AllowedMethods).toEqual(['GET', 'PUT', 'HEAD']);
    expect(rules[0].AllowedHeaders).toEqual(['*']);
  });

  it('replaces its own rule instead of adding a second one', () => {
    const first = mergeCorsRules([], ['https://old.test']);
    const second = mergeCorsRules(first, ['https://new.test']);

    expect(second).toHaveLength(1);
    expect(second[0].AllowedOrigins).toEqual(['https://new.test']);
  });

  it('leaves a rule it did not write alone', () => {
    const foreign = { ID: 'someone-elses', AllowedOrigins: ['https://other.test'] };

    const rules = mergeCorsRules([foreign], ['https://site.test']);

    expect(rules).toHaveLength(2);
    expect(rules).toContainEqual(foreign);
  });

  it('does not repeat an origin given twice', () => {
    const rules = mergeCorsRules([], ['https://site.test', 'https://site.test']);
    expect(rules[0].AllowedOrigins).toEqual(['https://site.test']);
  });
});
