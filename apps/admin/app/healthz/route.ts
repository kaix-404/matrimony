import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/env';

/**
 * The deploy's health check, and the console's only health signal.
 *
 * `/login` cannot serve as one: the page renders a form and makes no request, so
 * it answers 200 whether or not the API behind it exists. This console holds no
 * data of its own — every list and mutation is a call to the API — so a deploy
 * with the wrong `ADMIN_API_BASE_URL`, or with no API running, is broken in the
 * way a visitor notices first and the sign-in page cannot show.
 *
 * The upstream answer has to be the API's own liveness payload, not merely a
 * 200: a URL pointing at the wrong host tends to receive 200 from that host's
 * catch-all, which is how a health check passes while proving nothing.
 *
 * `proxy.ts` excludes this path, so it is answered without a session.
 */

/** Steady, not cached: a cached answer would outlive the deploy it describes. */
export const dynamic = 'force-dynamic';

/**
 * Render fails a check that does not answer within five seconds, so the upstream
 * gets less than that. A check that outlived Render's own timeout would report a
 * healthy console as broken.
 */
const API_TIMEOUT_MS = 4000;

type ApiState = 'ok' | 'timeout' | 'unreachable' | 'unhealthy' | 'unexpected';

interface Probe {
  api: ApiState;
  api_ms: number;
  upstream_status?: number;
  /** Logged, never returned: an operator reading the logs wants the cause. */
  detail?: string;
}

/** Asks the API whether it is alive, and names what went wrong when it is not. */
async function probeApi(): Promise<Probe> {
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/health/live`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (caught) {
    const timedOut = caught instanceof Error && caught.name === 'TimeoutError';
    return {
      api: timedOut ? 'timeout' : 'unreachable',
      api_ms: Date.now() - startedAt,
      detail: caught instanceof Error ? caught.message : String(caught),
    };
  }

  const apiMs = Date.now() - startedAt;
  if (!response.ok) {
    return { api: 'unhealthy', api_ms: apiMs, upstream_status: response.status };
  }

  const body: unknown = await response.json().catch(() => null);
  const status =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>).status
      : undefined;
  if (status !== 'ok') {
    return { api: 'unexpected', api_ms: apiMs, upstream_status: response.status };
  }

  return { api: 'ok', api_ms: apiMs, upstream_status: response.status };
}

/** The last reason logged, so a probe every few seconds does not fill the log. */
let lastReported = '';

export async function GET(): Promise<NextResponse> {
  const probe = await probeApi();
  const ok = probe.api === 'ok';
  const reason = ok
    ? ''
    : `${probe.api}${probe.upstream_status === undefined ? '' : ` (HTTP ${probe.upstream_status})`}${
        probe.detail === undefined ? '' : `: ${probe.detail}`
      }`;

  if (ok) {
    lastReported = '';
  } else if (reason !== lastReported) {
    lastReported = reason;
    console.error(
      `[admin-health] the API did not answer its liveness probe: ${reason} (${API_BASE_URL})`,
    );
  }

  return NextResponse.json(
    {
      status: ok ? 'ok' : 'unavailable',
      ok,
      api: probe.api,
      api_ms: probe.api_ms,
      ...(probe.upstream_status === undefined ? {} : { upstream_status: probe.upstream_status }),
    },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
