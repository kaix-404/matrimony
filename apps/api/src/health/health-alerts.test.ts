import { ALERTED_CHECKS, buildAlertReport } from './health-alerts';

/**
 * The alert endpoint exists so a stalled repair path reaches a person without one
 * of them opening the console. Two mistakes would make it useless: paging for a
 * provider that is merely waiting on credentials, and paging for a check an older
 * release does not have.
 */
describe('buildAlertReport', () => {
  it('alerts on a stalled repair path and keeps the checks in a stable order', () => {
    const report = buildAlertReport(
      {
        database: 'up',
        accountRetention: 'down',
        email: 'down',
        pushDispatch: 'down',
      },
      '2026-11-21T12:00:00.000Z',
    );

    // `email: down` is a deployment still waiting for credentials, not a fault.
    expect(report).toEqual({
      status: 'down',
      down: ['pushDispatch', 'accountRetention'],
      checkedAt: '2026-11-21T12:00:00.000Z',
    });
  });

  it('is ok when every alerted check is up, however many providers are unconfigured', () => {
    const report = buildAlertReport(
      {
        database: 'up',
        clock: 'up',
        email: 'down',
        sms: 'down',
        push: 'down',
        payments: 'down',
        paymentWebhooks: 'down',
        identityVerification: 'down',
      },
      '2026-11-21T12:00:00.000Z',
    );

    expect(report).toEqual({ status: 'ok', down: [], checkedAt: '2026-11-21T12:00:00.000Z' });
  });

  it('does not treat a check an older release lacks as down', () => {
    // A rollback before `accountRetention` existed must not page forever.
    const report = buildAlertReport({ database: 'up' }, '2026-11-21T12:00:00.000Z');

    expect(report.status).toBe('ok');
  });

  it('only ever names alerted checks', () => {
    const allDown = Object.fromEntries(ALERTED_CHECKS.map((check) => [check, 'down'])) as Record<
      string,
      'down'
    >;

    expect(buildAlertReport(allDown, 'now').down).toEqual([...ALERTED_CHECKS]);
  });
});
