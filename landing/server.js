const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * The site for Networth Matrimony.
 *
 * Three things live at one origin, which is the whole reason this file exists:
 *
 *   1. `/`          the landing page (`landing/index.html`);
 *   2. `/app/...`   the member app — the Expo web build of the mobile app, so it
 *                   is the same screens and the same API calls, not a second
 *                   frontend that has to be kept in step;
 *   3. `/api/...`   a proxy to the Nest API.
 *
 * Plus `/healthz` (and `/health`), the deploy's own check: it is the one path
 * here allowed to answer 503. See `serveHealth`.
 *
 * The proxy is what removes CORS from the picture. The browser app calls
 * `/api/v1/...` relative to its own origin, so the API's `API_CORS_ORIGINS` can
 * stay limited to the admin console instead of having to name whatever hostname
 * Render happens to give this service — and a same-origin request has no
 * preflight to get wrong.
 */

const PORT = process.env.PORT || 3000;

/** Where the API actually lives. Overridable so a preview host can point elsewhere. */
const API_ORIGIN = process.env.API_ORIGIN || 'https://matrimony-api-2bmy.onrender.com';

const LANDING_FILE = path.join(__dirname, 'index.html');

/**
 * The exported app. `app.json` sets `experiments.baseUrl: "/app"`, so the bundle
 * asks for `/app/_expo/...`; this is the directory those paths map onto.
 */
const APP_DIR = path.join(__dirname, '..', 'apps', 'mobile', 'dist');
const APP_INDEX = path.join(APP_DIR, 'index.html');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function sendFile(res, filePath, { cache }) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error loading page');
      return;
    }
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': cache,
    });
    res.end(data);
  });
}

/** Serves the landing page. */
function serveLanding(res) {
  sendFile(res, LANDING_FILE, { cache: 'no-cache' });
}

/**
 * Serves the exported app.
 *
 * Anything under `/app` that is not a file on disk gets `index.html`, because
 * client-side routes (`/app/profile`, `/app/pricing`) only exist in the bundle;
 * without that, a refresh or a shared link lands on a 404.
 */
function serveApp(req, res, pathname) {
  const relative = pathname.replace(/^\/app\/?/, '');
  const candidate = path.resolve(APP_DIR, relative);
  const insideAppDir = candidate === APP_DIR || candidate.startsWith(APP_DIR + path.sep);

  // Hashed bundles can be cached hard; the HTML that points at them cannot, or a
  // new deploy keeps serving the old entrypoint.
  const isHtml = relative === '' || relative.endsWith('/') || path.extname(relative) === '';
  if (!insideAppDir) return serveAppIndex(res);
  if (isHtml) return serveAppIndex(res);

  fs.stat(candidate, (err, stats) => {
    if (err || !stats.isFile()) return serveAppIndex(res);
    const immutable = pathname.includes('/_expo/');
    sendFile(res, candidate, { cache: immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
  });
}

/**
 * Answers when the exported app is not on disk.
 *
 * This is the one failure this service has actually had: the build command was
 * a landing-page build, so `apps/mobile/dist` never appeared, and every
 * `/app/...` route answered a bare 500 "Error loading page" that named no
 * cause. The file being absent is nearly always a build command that did not run
 * `export:web`, so the response and the log line both say so.
 */
let missingBuildReported = false;

function appBuildMissing(res) {
  if (!missingBuildReported) {
    missingBuildReported = true;
    console.error(
      `The exported app is missing: ${APP_INDEX}\n` +
        'Build it with `npm run export:web -w @matrimony/mobile`; /app cannot be served without it.',
    );
  }
  res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('The member app build is missing from this deployment.');
}

function serveAppIndex(res) {
  fs.readFile(APP_INDEX, (err, data) => {
    if (err) return appBuildMissing(res);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

/**
 * The deploy's health, for Render's health check.
 *
 * `/` and `/app` cannot answer anything but 200: the landing page is the
 * fallback for every path that is not `/app` or `/api`, and `/app/...` falls
 * back to the exported `index.html` for any file that is not on disk. A check
 * pointed at either therefore passes on a deploy that cannot serve what it is
 * checking — no app bundles at all, or a landing page missing from the image.
 *
 * So this asks the two real questions: the landing page is readable, and every
 * asset the app's entrypoint references is on disk. It deliberately does not
 * call the API: this service is healthy when it can serve its own files, and a
 * cold free-tier API would otherwise fail a deploy that is perfectly fine.
 */
const ASSET_REFERENCE = /(?:src|href)="(\/app\/[^"]+)"/g;

/** Every distinct `/app/...` file the exported entrypoint points at. */
function appAssetReferences(entryHtml) {
  const references = new Set();
  for (const match of entryHtml.matchAll(ASSET_REFERENCE)) references.add(match[1]);
  return [...references];
}

/** Resolves a `/app/...` URL to a file in the export, or null if it escapes it. */
function resolveAppFile(reference) {
  const candidate = path.resolve(APP_DIR, reference.replace(/^\/app\/?/, ''));
  return candidate === APP_DIR || candidate.startsWith(APP_DIR + path.sep) ? candidate : null;
}

function isReadable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function checkDeployment() {
  const problems = [];

  const landingOk = isReadable(LANDING_FILE);
  if (!landingOk) problems.push(`landing page is not readable: ${LANDING_FILE}`);

  let appState = 'ok';
  let entry;
  try {
    entry = fs.readFileSync(APP_INDEX, 'utf8');
  } catch {
    appState = 'missing';
    problems.push(`the exported app is missing: ${APP_INDEX}`);
  }

  let checked = 0;
  if (entry !== undefined) {
    for (const reference of appAssetReferences(entry)) {
      checked += 1;
      const file = resolveAppFile(reference);
      if (file === null || !isReadable(file)) {
        if (appState === 'ok') appState = 'incomplete';
        problems.push(`app asset is missing: ${reference}`);
      }
    }
    // An entrypoint that references no bundles is not a working app, even though
    // the file itself exists.
    if (checked === 0) {
      if (appState === 'ok') appState = 'incomplete';
      problems.push('the app entrypoint references no bundles');
    }
  }

  return {
    ok: problems.length === 0,
    landing: landingOk ? 'ok' : 'missing',
    app: appState,
    app_assets_checked: checked,
    problems,
  };
}

/**
 * The reasons last logged. A probe every 30 seconds must not fill the log, but a
 * deploy that starts failing for a *new* reason has to say so.
 */
let lastReportedProblems = '';

function serveHealth(res) {
  const result = checkDeployment();
  const signature = result.problems.join('; ');

  if (result.ok) {
    lastReportedProblems = '';
  } else if (signature !== lastReportedProblems) {
    lastReportedProblems = signature;
    console.error(`Health check failing: ${signature}`);
  }

  res.writeHead(result.ok ? 200 : 503, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify({ status: result.ok ? 'ok' : 'unavailable', ...result }));
}

/** Streams API traffic to the Nest service and back, headers and all. */
function proxyApi(req, res) {
  const target = new URL(API_ORIGIN);
  const headers = { ...req.headers, host: target.host };

  const upstream = https.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      method: req.method,
      path: req.url,
      headers,
    },
    (upstreamRes) => {
      upstreamRes.on('error', () => res.destroy());
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  // The browser can give up first — a closed tab, a timeout, a reload. Without
  // this the upstream request keeps its socket open for a response nobody will
  // read.
  res.on('close', () => upstream.destroy());

  upstream.on('error', () => {
    // A free-tier API asleep behind a cold start can take a while, but a refused
    // connection is ours to report: answer with the shape the app's error parser
    // already understands instead of dropping the socket.
    if (!res.headersSent && !res.writableEnded) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ statusCode: 502, message: 'The API is unreachable right now.' }));
    }
  });

  req.pipe(upstream);
}

/**
 * The path this request is routed on.
 *
 * `new URL(req.url, base)` is not safe here. Node's HTTP parser accepts request
 * targets that the WHATWG parser rejects — `//[` is one — and that throw lands
 * inside the request handler, where nothing catches it, so it ends the process.
 * Every request after it, `/app/auth` included, then got Render's 502 page
 * until the service restarted, and a scanner needs only one such path to do it.
 */
function requestPath(req) {
  const target = req.url || '/';
  // Normal requests are origin-form already: split, do not parse, so there is
  // nothing here that can throw.
  if (target.startsWith('/')) return target.split(/[?#]/)[0] || '/';
  // Absolute-form (a proxy forwarding to us) does have to be parsed, so the one
  // parse that can throw is the one that is caught.
  try {
    return new URL(target).pathname || '/';
  } catch {
    return '/';
  }
}

const server = http.createServer((req, res) => {
  try {
    const pathname = requestPath(req);

    if (pathname === '/health' || pathname === '/healthz') return serveHealth(res);
    if (pathname === '/api' || pathname.startsWith('/api/')) return proxyApi(req, res);
    if (pathname === '/app' || pathname.startsWith('/app/')) return serveApp(req, res, pathname);
    return serveLanding(res);
  } catch (err) {
    // One request must never be able to end the process: the health check would
    // pass again after the restart and say nothing about it, while every request
    // in between got an error page the service did not write.
    console.error(`Request failed: ${req.method} ${req.url}`, err);
    if (res.headersSent) return res.destroy();
    res.writeHead(500, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end('Internal error');
  }
});

// A malformed request line never reaches a handler at all; Node emits it here.
// The default drops the socket, but that must not throw out of the server either.
server.on('clientError', (err, socket) => {
  if (err.code === 'ECONNRESET' || !socket.writable) return socket.destroy();
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.listen(PORT, () => {
  console.log(`Networth Matrimony site running on port ${PORT}`);
  console.log(`API traffic proxied to ${API_ORIGIN}`);
  // Said at boot, where a deploy log will show it, rather than only on the first
  // request someone happens to make to `/app`.
  if (!fs.existsSync(APP_INDEX)) {
    console.error(
      `The exported app is missing: ${APP_INDEX} — /app will answer 503 until it is built.`,
    );
  }
});
