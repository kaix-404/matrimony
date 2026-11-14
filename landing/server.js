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

function serveAppIndex(res) {
  sendFile(res, APP_INDEX, { cache: 'no-cache' });
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
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on('error', () => {
    // A free-tier API asleep behind a cold start can take a while, but a refused
    // connection is ours to report: answer with the shape the app's error parser
    // already understands instead of dropping the socket.
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ statusCode: 502, message: 'The API is unreachable right now.' }));
    }
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;

  if (pathname === '/api' || pathname.startsWith('/api/')) return proxyApi(req, res);
  if (pathname === '/app' || pathname.startsWith('/app/')) return serveApp(req, res, pathname);
  return serveLanding(res);
});

server.listen(PORT, () => {
  console.log(`Networth Matrimony site running on port ${PORT}`);
  console.log(`API traffic proxied to ${API_ORIGIN}`);
});
