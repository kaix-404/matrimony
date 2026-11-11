#!/usr/bin/env node
/**
 * Post-deploy smoke test for the API.
 *
 * A deploy succeeding in Render says the container booted; it does not say the
 * route tree is the one that shipped, that the guards are still in front of the
 * endpoints that must not be public, or that the client's lists survived the
 * migration. This asks the running service those questions from outside, using
 * only requests that are safe against production: reads, plus three unauthenticated
 * POSTs that a guard must refuse before any handler or mail send is reached.
 *
 * Every check is a status the API is contractually expected to answer, so a
 * failure here is a fact, not a heuristic. Provider readiness is reported but
 * never fatal: a service with no email credentials is doing exactly what it was
 * configured to do, and failing the smoke test over it would train everyone to
 * ignore the result.
 *
 *   node scripts/smoke-api.mjs                      # against production
 *   node scripts/smoke-api.mjs --base http://localhost:4000/api/v1
 *   node scripts/smoke-api.mjs --json               # machine-readable
 */
const DEFAULT_BASE = 'https://matrimony-api-2bmy.onrender.com/api/v1';
const TIMEOUT_MS = 20_000;

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 || argv[at + 1] === undefined ? fallback : argv[at + 1];
};
const base = flag('--base', process.env.API_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, '');
const asJson = argv.includes('--json');

/** One request, never throwing: a failure is a result the report has to show. */
async function request(path, init = {}) {
  const started = Date.now();
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
    });
    const text = await response.text();
    let body = null;
    try {
      body = text === '' ? null : JSON.parse(text);
    } catch {
      body = text.slice(0, 200);
    }
    return { status: response.status, body, ms: Date.now() - started };
  } catch (error) {
    return {
      status: 0,
      body: null,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const checks = [
  {
    name: 'liveness',
    path: '/health/live',
    run: async () => {
      const result = await request('/health/live');
      return {
        ok: result.status === 200 && result.body?.status === 'ok',
        detail: `${result.status}${result.error ? ` ${result.error}` : ''}`,
        ms: result.ms,
      };
    },
  },
  {
    name: 'readiness',
    path: '/health/ready',
    run: async () => {
      const result = await request('/health/ready');
      const failed = Object.entries(result.body?.checks ?? {})
        .filter(([key, value]) => value === 'down' && (key === 'database' || key === 'clock'))
        .map(([key]) => key);
      return {
        ok: result.status === 200 && failed.length === 0,
        detail:
          result.status === 200
            ? (result.body?.status ?? 'ok')
            : `${result.status} ${failed.length ? `degraded: ${failed.join(', ')}` : (result.error ?? '')}`,
        ms: result.ms,
      };
    },
  },
  {
    name: 'master lists seeded',
    run: async () => {
      const result = await request('/master-data/lists');
      const lists = Array.isArray(result.body?.lists) ? result.body.lists : null;
      const counts = lists
        ? lists.map(
            (list) => `${list.key}=${Array.isArray(list.values) ? list.values.length : '?'}`,
          )
        : [];
      // Community is wired but empty until the client sends values, so an empty
      // list is not a fault; a missing list endpoint is.
      const expected = ['RELIGION', 'MOTHER_TONGUE', 'EDUCATION', 'PROFESSION', 'CASTE', 'STATE'];
      const missing = lists
        ? expected.filter((key) => !lists.some((list) => list.key === key))
        : expected;
      return {
        ok: result.status === 200 && lists !== null && missing.length === 0,
        detail:
          result.status === 200
            ? missing.length
              ? `missing ${missing.join(', ')}`
              : counts.join(' ')
            : `${result.status}${result.error ? ` ${result.error}` : ''}`,
        ms: result.ms,
      };
    },
  },
  {
    name: 'account route guarded',
    run: async () => {
      const result = await request('/auth/me');
      return { ok: result.status === 401, detail: `${result.status}`, ms: result.ms };
    },
  },
  {
    name: 'email change guarded',
    run: async () => {
      // A guard must refuse this before the handler reaches the mailer, so an
      // unauthenticated call cannot spend the client's sending credits.
      const result = await request('/auth/email/otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'smoke-test@example.invalid' }),
      });
      return { ok: result.status === 401, detail: `${result.status}`, ms: result.ms };
    },
  },
  {
    name: 'admin route guarded',
    run: async () => {
      const result = await request('/admin/master-lists');
      return { ok: result.status === 401, detail: `${result.status}`, ms: result.ms };
    },
  },
  {
    name: 'unknown route is 404',
    run: async () => {
      const result = await request('/definitely-not-a-route');
      return { ok: result.status === 404, detail: `${result.status}`, ms: result.ms };
    },
  },
];

const results = [];
for (const check of checks) {
  const result = await check.run();
  results.push({ name: check.name, ...result });
}

// Readiness detail that a person actually wants: which vendors are on.
const ready = await request('/health/ready');
const providers = Object.entries(ready.body?.checks ?? {}).filter(([key]) =>
  ['identityVerification', 'sms', 'email', 'push'].includes(key),
);
const awaiting = providers.filter(([, value]) => value === 'down').map(([key]) => key);

const failed = results.filter((result) => !result.ok);

if (asJson) {
  console.log(
    JSON.stringify(
      { base, ok: failed.length === 0, checks: results, awaitingCredentials: awaiting },
      null,
      2,
    ),
  );
} else {
  console.log(`Smoke test against ${base}`);
  for (const result of results) {
    const mark = result.ok ? 'ok  ' : 'FAIL';
    console.log(`  ${mark} ${result.name.padEnd(24)} ${result.detail} (${result.ms}ms)`);
  }
  if (providers.length > 0) {
    const on = providers.filter(([, value]) => value === 'up').map(([key]) => key);
    console.log(
      `  providers: ${on.length ? on.join(', ') : 'none'}${
        awaiting.length ? ` — awaiting credentials: ${awaiting.join(', ')}` : ''
      }`,
    );
  }
  console.log(
    failed.length === 0
      ? `\nAll ${results.length} checks passed.`
      : `\n${failed.length} of ${results.length} checks failed: ${failed.map((result) => result.name).join(', ')}`,
  );
}

process.exit(failed.length === 0 ? 0 : 1);
