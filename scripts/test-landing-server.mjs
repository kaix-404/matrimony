#!/usr/bin/env node
/**
 * The landing server's regression test.
 *
 * `landing/server.js` serves three things on one origin, and the failure this
 * guards is not a wrong status code: one malformed request target — `//[`,
 * which Node's parser accepts and the WHATWG URL parser rejects — used to throw
 * inside the request handler and end the process. Every request after it,
 * `/app/auth` among them, got Render's 502 page until the service restarted,
 * and a scanner needs only one such path to do it.
 *
 * So there are three kinds of check here: the normal routes answer what they
 * should, the crafted targets are answered instead of being fatal, and the
 * server is still running at the end. The requests are written by hand over a
 * socket because `fetch` normalises exactly the targets this test exists to
 * send.
 *
 *   node scripts/test-landing-server.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverFile = path.join(root, 'landing', 'server.js');
const appIndex = path.join(root, 'apps', 'mobile', 'dist', 'index.html');

/** The export is built by `npm run export:web`; without it `/app` answers 503. */
const hasApp = fs.existsSync(appIndex);

/** A port nothing is listening on, so the proxy's failure path is deterministic. */
const DEAD_UPSTREAM = 'https://127.0.0.1:9';

/** Asks the OS for a free port rather than guessing one a test run might collide with. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Removes chunked framing from a response body.
 *
 * The server writes its JSON without a length, so Node frames it by chunks; a
 * check that reads the body has to put the pieces back together first.
 */
function dechunk(body) {
  let out = '';
  let at = 0;
  for (;;) {
    const eol = body.indexOf('\r\n', at);
    if (eol === -1) return out;
    const size = Number.parseInt(body.slice(at, eol), 16);
    if (!Number.isFinite(size) || size === 0) return out;
    out += body.slice(eol + 2, eol + 2 + size);
    at = eol + 2 + size + 2;
  }
}

/**
 * One HTTP/1.1 exchange, request line included verbatim.
 *
 * Resolves with the status and the raw body; a server that dies mid-request
 * resolves with status 0 and the connection's error as `failure`.
 */
function request(port, requestLine, headers = '', body = '') {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    let raw = '';
    socket.setEncoding('utf8');
    socket.setTimeout(15_000, () => socket.destroy(new Error('timed out')));
    socket.on('connect', () => {
      socket.write(
        `${requestLine}\r\nHost: landing.test\r\n${headers}Connection: close\r\n\r\n${body}`,
      );
    });
    socket.on('data', (chunk) => {
      raw += chunk;
    });
    socket.on('error', (error) => {
      resolve({ status: 0, head: '', body: '', failure: error.message });
    });
    socket.on('close', () => {
      const split = raw.indexOf('\r\n\r\n');
      const head = split === -1 ? raw : raw.slice(0, split);
      const encoded = split === -1 ? '' : raw.slice(split + 4);
      const chunked = /transfer-encoding:\s*chunked/i.test(head);
      const body = chunked ? dechunk(encoded) : encoded;
      resolve({
        status: Number((head.match(/^HTTP\/1\.1 (\d{3})/) || [])[1] ?? 0),
        head,
        body,
      });
    });
  });
}

/** Waits for the process to accept a connection, so the checks are not racing boot. */
async function waitForListen(port, deadlineMs = 10_000) {
  const started = Date.now();
  for (;;) {
    const open = await new Promise((resolve) => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });
    if (open) return;
    if (Date.now() - started > deadlineMs) throw new Error('the server never started listening');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const port = await freePort();
const child = spawn(process.execPath, [serverFile], {
  env: { ...process.env, PORT: String(port), API_ORIGIN: DEAD_UPSTREAM },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
child.stdout.on('data', (chunk) => {
  serverLog += chunk;
});
child.stderr.on('data', (chunk) => {
  serverLog += chunk;
});

const alive = () => child.exitCode === null && child.signalCode === null;

const results = [];

/** Runs one check; a hang, a throw or a dead server is a failure with its reason. */
async function check(name, run) {
  if (!alive()) {
    results.push({ name, ok: false, detail: 'the server was already gone' });
    return;
  }
  try {
    const result = await run();
    results.push({ name, ok: result.ok, detail: result.detail });
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

try {
  await waitForListen(port);

  // The three that used to kill the process. Node's parser accepts each one as
  // a request target; `new URL(target, base)` throws on all of them.
  for (const target of ['//[', '//foo:bar', '//@:443']) {
    await check(`malformed target survives: ${target}`, async () => {
      const response = await request(port, `GET ${target} HTTP/1.1`);
      return { ok: response.status === 200, detail: `status ${response.status}` };
    });
    await check(`server alive after: ${target}`, async () => ({
      ok: alive(),
      detail: alive() ? 'running' : `exited (${child.exitCode})`,
    }));
  }

  await check('landing page', async () => {
    const response = await request(port, 'GET / HTTP/1.1');
    return {
      ok: response.status === 200 && response.body.includes('Networth'),
      detail: `status ${response.status}, ${response.body.length} bytes`,
    };
  });

  await check('health check', async () => {
    const response = await request(port, 'GET /healthz HTTP/1.1');
    const expected = hasApp ? 200 : 503;
    let parsed = null;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      parsed = null;
    }
    return {
      ok: response.status === expected && parsed !== null && parsed.ok === hasApp,
      detail: `status ${response.status}${parsed === null ? ' (not JSON)' : ` ok=${parsed.ok}`}`,
    };
  });

  await check('member app route', async () => {
    const response = await request(port, 'GET /app/auth HTTP/1.1');
    if (!hasApp) {
      return {
        ok: response.status === 503 && response.body.includes('missing'),
        detail: `no export built: status ${response.status}`,
      };
    }
    return {
      ok: response.status === 200 && response.body.includes('id="root"'),
      detail: `status ${response.status}, ${response.body.length} bytes`,
    };
  });

  // The catch-all must not become a file server: `..` cannot climb out of the
  // export and hand back the server's own source.
  await check('path traversal cannot read the server source', async () => {
    const response = await request(port, 'GET /app/../server.js HTTP/1.1');
    return {
      ok: !response.body.includes("require('http')"),
      detail: `status ${response.status}`,
    };
  });

  // A dead upstream is the proxy's own failure path: it must answer in the shape
  // the app's error parser understands, and the process must survive it.
  await check('api proxy reports an unreachable API', async () => {
    const response = await request(port, 'GET /api/v1/health/live HTTP/1.1');
    return {
      ok: response.status === 502 && response.body.includes('API_UNAVAILABLE'),
      detail: `status ${response.status}`,
    };
  });

  // A buffered POST body is the path that can be replayed; it must still answer
  // rather than wait on a stream that has already been read.
  await check('api proxy answers a request with a body', async () => {
    const response = await request(
      port,
      'POST /api/v1/auth/otp/request HTTP/1.1',
      'Content-Type: application/json\r\nContent-Length: 2\r\n',
      '{}',
    );
    return {
      ok: response.status === 502 && response.body.includes('API_UNAVAILABLE'),
      detail: `status ${response.status}`,
    };
  });

  await check('server still serving', async () => {
    const response = await request(port, 'GET /healthz HTTP/1.1');
    return {
      ok: alive() && response.status > 0,
      detail: `status ${response.status}`,
    };
  });
} finally {
  if (alive()) child.kill();
}

const failed = results.filter((result) => !result.ok);

console.log(`Landing server${hasApp ? ' (with the exported app)' : ' (app export absent)'}`);
for (const result of results) {
  console.log(`  ${result.ok ? 'ok  ' : 'FAIL'} ${result.name.padEnd(48)} ${result.detail}`);
}

if (failed.length > 0) {
  console.log(`\n${failed.length} of ${results.length} checks failed.`);
  if (serverLog.trim() !== '') console.log(`\nServer output:\n${serverLog.trim()}`);
} else {
  console.log(`\nAll ${results.length} checks passed.`);
}

process.exit(failed.length === 0 ? 0 : 1);
