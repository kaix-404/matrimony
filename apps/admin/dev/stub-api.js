/*
 * A stub of the admin API, so the dashboard can be looked at and clicked
 * through without Postgres, Docker or the NestJS app running.
 *
 * There is no database here and no authentication: every request is treated as
 * the moderator below, which is the point. It exists to render the pages and to
 * exercise the flows that are awkward to reach against a real service — the
 * oldest-first queues, a decision that has already been made, a rejection with
 * no reason. It is deliberately not a fake of the whole API, and starting it
 * from a test would be a mistake: the pages are covered by `next build` and the
 * helpers by jest, and this file is for the part neither of those can see.
 *
 * It mirrors the API's rules where the console depends on them, and lines that
 * do so say which rule they are mirroring, so a divergence is visible rather
 * than silent. Run it with `npm run dev:stub` in this app and point
 * `ADMIN_API_BASE_URL` at it (see README.md).
 */
const http = require('http');

const PORT = Number(process.env.STUB_PORT ?? 4999);

const role = (slug, name, keys) => ({
  id: `role_${slug}`,
  slug,
  name,
  description: null,
  permissions: keys.map((key) => ({
    key,
    resource: key.split(':')[0],
    action: key.split(':')[1],
    sensitive: false,
  })),
});

const roles = [
  role('SUPER_ADMIN', 'Super Admin', ['admin:manage', 'user:read', 'report:review', 'system:read']),
  role('ADMIN', 'Admin', ['admin:manage', 'user:read']),
  role('MODERATION_ADMIN', 'Moderation Admin', ['report:review', 'identity_verify:read']),
  role('FINANCE_ADMIN', 'Finance Admin', ['payment:read', 'data_request:handle']),
];

const self = {
  id: 'admin_1',
  email: 'ops@example.com',
  name: 'Ops',
  status: 'ACTIVE',
  // Super Admin so every page, including the permission-gated System status,
  // is reachable while clicking through. The roles screen still shows the other
  // roles and the permissions each grants.
  roles: ['SUPER_ADMIN'],
  mfaEnabled: true,
  lastLoginAt: '2026-11-07T09:12:00.000Z',
  createdAt: '2026-09-01T04:00:00.000Z',
};

const other = {
  id: 'admin_2',
  email: 'finance@example.com',
  name: 'Finance',
  status: 'ACTIVE',
  roles: ['FINANCE_ADMIN'],
  mfaEnabled: true,
  lastLoginAt: '2026-11-06T15:40:00.000Z',
  createdAt: '2026-09-02T04:00:00.000Z',
};

const overdue = {
  id: 'dr_overdue',
  userId: 'user_abc123',
  type: 'ERASURE',
  status: 'REQUESTED',
  requestedAt: '2026-10-01T05:00:00.000Z',
  dueAt: '2026-10-31T00:00:00.000Z',
  completedAt: null,
  resolutionNotes: null,
  handledByAdminId: null,
};

const done = {
  id: 'dr_done',
  userId: 'user_def456',
  type: 'EXPORT',
  status: 'COMPLETED',
  requestedAt: '2026-11-01T05:00:00.000Z',
  dueAt: '2026-11-30T00:00:00.000Z',
  completedAt: '2026-11-02T09:30:00.000Z',
  resolutionNotes: 'Archive generated and sent to the registered mobile number.',
  handledByAdminId: 'admin_1',
};

const openReport = {
  id: 'rep_1',
  status: 'OPEN',
  reason_code: 'HARASSMENT',
  reporter_user_id: 'user_rep',
  reported_profile_id: 'profile_x',
  reported_user_id: 'user_bad',
  description: 'Sent repeated abusive messages after being declined.',
  review_notes: null,
  action_taken: null,
  resolved_at: null,
  resolved_by_admin_id: null,
  created_at: '2026-11-03T07:15:00.000Z',
  updated_at: '2026-11-03T07:15:00.000Z',
};

const members = [
  {
    id: 'user_abc123',
    email: 'asha.rao@example.com',
    mobile: '9876543210',
    status: 'ACTIVE',
    createdAt: '2026-09-01T04:00:00.000Z',
  },
  {
    id: 'user_def456',
    email: null,
    mobile: '9123456780',
    status: 'AWAITING_SETUP_FEE',
    createdAt: '2026-09-02T04:00:00.000Z',
  },
  {
    id: 'user_ghi789',
    email: 'ravi@example.com',
    mobile: '9000000001',
    status: 'SUSPENDED',
    createdAt: '2026-09-03T04:00:00.000Z',
  },
];

const details = {
  user_abc123: {
    id: 'user_abc123',
    email: 'asha.rao@example.com',
    mobile: '9876543210',
    status: 'ACTIVE',
    createdAt: '2026-09-01T04:00:00.000Z',
    lastLoginAt: '2026-11-05T06:30:00.000Z',
    isPhoneVerified: true,
    identityVerifiedAt: '2026-09-05T06:00:00.000Z',
    setupFeePaidAt: '2026-09-05T06:05:00.000Z',
    networthCategory: 'ABOVE_2CR',
    categoryReviewNote: null,
    categoryChangedAt: null,
    deletedAt: null,
    profile: { id: 'profile_asha', status: 'APPROVED', visibility: 'ACTIVE' },
  },
  user_def456: {
    id: 'user_def456',
    email: null,
    mobile: '9123456780',
    status: 'AWAITING_SETUP_FEE',
    createdAt: '2026-09-02T04:00:00.000Z',
    lastLoginAt: null,
    isPhoneVerified: true,
    identityVerifiedAt: null,
    setupFeePaidAt: null,
    networthCategory: 'PENDING_REVIEW',
    categoryReviewNote: 'Uploaded statement unreadable; asked for a CA certificate.',
    categoryChangedAt: '2026-10-02T04:00:00.000Z',
    deletedAt: null,
    profile: { id: 'profile_dev', status: 'DRAFT', visibility: 'HIDDEN' },
  },
  user_ghi789: {
    id: 'user_ghi789',
    email: 'ravi@example.com',
    mobile: '9000000001',
    status: 'SUSPENDED',
    createdAt: '2026-09-03T04:00:00.000Z',
    lastLoginAt: '2026-10-20T11:00:00.000Z',
    isPhoneVerified: true,
    identityVerifiedAt: '2026-09-07T06:00:00.000Z',
    setupFeePaidAt: '2026-09-07T06:10:00.000Z',
    networthCategory: 'BETWEEN_1CR_2CR',
    categoryReviewNote: null,
    categoryChangedAt: null,
    deletedAt: '2026-10-25T04:00:00.000Z',
    profile: null,
  },
};

// The profile review queue (section 26). Mutated by the approve/reject routes
// below, so a walkthrough can watch a row leave the pending list.
const queueProfiles = [
  {
    id: 'profile_asha',
    user_id: 'user_abc123',
    name: 'Asha Rao',
    city: 'Pune',
    age: 29,
    status: 'PENDING_REVIEW',
    photo_url: null,
    submitted_at: '2026-11-06T08:10:00.000Z',
    reviewed_at: null,
    rejection_reason: null,
  },
  {
    id: 'profile_kiran',
    user_id: 'user_klm012',
    name: 'Kiran Shetty',
    city: 'Mangaluru',
    age: 32,
    status: 'PENDING_REVIEW',
    photo_url: null,
    submitted_at: '2026-11-04T11:45:00.000Z',
    reviewed_at: null,
    rejection_reason: null,
  },
  {
    id: 'profile_meera',
    user_id: 'user_nop345',
    name: 'Meera Iyer',
    city: 'Chennai',
    age: 27,
    status: 'PENDING_REVIEW',
    photo_url: null,
    submitted_at: '2026-10-28T06:00:00.000Z',
    reviewed_at: null,
    rejection_reason: null,
  },
  {
    id: 'profile_dev',
    user_id: 'user_def456',
    name: 'Dev Kumar',
    city: 'Hyderabad',
    age: 34,
    status: 'APPROVED',
    photo_url: null,
    submitted_at: '2026-10-20T09:30:00.000Z',
    reviewed_at: '2026-10-21T05:00:00.000Z',
    rejection_reason: null,
  },
  {
    id: 'profile_ravi',
    user_id: 'user_ghi789',
    name: 'Ravi Menon',
    city: 'Kochi',
    age: 38,
    status: 'REJECTED',
    photo_url: null,
    submitted_at: '2026-10-10T04:15:00.000Z',
    reviewed_at: '2026-10-12T07:20:00.000Z',
    rejection_reason: 'The photo appears to be a stock image. Please upload one of yourself.',
  },
];

const categories = [
  {
    key: 'BELOW_1CR',
    label: 'Below Rs 1 crore',
    description: 'Up to Rs 1 crore of documented net worth.',
    min_inr: null,
    max_inr: '10000000',
    setup_fee_amount: '15.00',
    setup_fee_total: '17.70',
    is_discoverable: true,
    sort_order: 1,
  },
  {
    key: 'BETWEEN_1CR_2CR',
    label: 'Rs 1 crore to Rs 2 crore',
    description: 'Rs 1 crore up to Rs 2 crore.',
    min_inr: '10000000',
    max_inr: '20000000',
    setup_fee_amount: '15.00',
    setup_fee_total: '17.70',
    is_discoverable: true,
    sort_order: 2,
  },
  {
    key: 'ABOVE_2CR',
    label: 'Above Rs 2 crore',
    description: 'Above Rs 2 crore.',
    min_inr: '20000000',
    max_inr: null,
    setup_fee_amount: '15.00',
    setup_fee_total: '17.70',
    is_discoverable: true,
    sort_order: 3,
  },
  {
    key: 'PENDING_REVIEW',
    label: 'Awaiting review',
    description: 'Registered without a readable document.',
    min_inr: null,
    max_inr: null,
    setup_fee_amount: '15.00',
    setup_fee_total: '17.70',
    is_discoverable: false,
    sort_order: 0,
  },
];

/**
 * The permission keys a set of roles grants.
 *
 * Mirrors the API's rule that roles are OR-ed, because `GET /admin/me` is what
 * the console draws its sidebar from: a stub that answered with fewer grants
 * would hide links the real service shows.
 */
const permissionsFor = (slugs) => [
  ...new Set(
    roles
      .filter((row) => slugs.includes(row.slug))
      .flatMap((row) => row.permissions.map((grant) => grant.key)),
  ),
];

const base64url = (value) => Buffer.from(value).toString('base64url');

/**
 * A readable admin access token, not an opaque string.
 *
 * The console's edge gate decodes `exp` before every page render (lib/jwt.ts) to
 * decide whether to swap the refresh token first. An opaque token never decodes,
 * so each navigation looked expired and was bounced to `/login` through a refresh
 * call the stub does not have — which is why signing in here used to go nowhere.
 * The signature is never checked by the console; only the API verifies it.
 */
function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    typ: 'admin_access',
    sub: self.id,
    roles: self.roles,
    permissions: permissionsFor(self.roles),
    iat: now,
    exp: now + 12 * 60 * 60,
  };
  return `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify(claims),
  )}.stub-signature`;
}

/** The token pair both `/admin/auth/login` and `/admin/auth/refresh` answer with. */
const sessionTokens = () => ({
  access_token: accessToken(),
  refresh_token: 'stub.refresh.token',
  token_type: 'Bearer',
  expires_in: 12 * 60 * 60,
});

const routes = {
  '/api/v1/admin/me': {
    id: self.id,
    email: self.email,
    name: self.name,
    roles: self.roles,
    permissions: permissionsFor(self.roles),
  },
  // The permission-checked readiness mirror the System status page reads. The
  // public `/health/ready` is not stubbed: this is the route the console calls.
  // Built per request, not once: the Release and sweep cards are judged against
  // these timestamps, so a stub left running for an hour would otherwise show
  // the console the "Stalled" state it renders for a dead timer.
  '/api/v1/admin/system/health': () => {
    const now = Date.now();
    const sweepAgeMinutes = Number(process.env.STUB_SWEEP_AGE_MINUTES ?? 4);
    const sweptAt = new Date(now - sweepAgeMinutes * 60_000).toISOString();
    // Mirrors the API's RECONCILIATION_STALE_AFTER_MS: one interval plus a minute.
    // Set STUB_SWEEP_AGE_MINUTES past 11 to see the console's Stalled state.
    const stale = sweepAgeMinutes > 11;
    // How far the oldest retained account is past its purge date. Mirrors the
    // API's ACCOUNT_RETENTION_OVERDUE_AFTER_MS (two six-hourly sweeps), so set
    // STUB_RETENTION_DUE_HOURS past 12 to see the console's Overdue state.
    const retentionDueHours = Number(process.env.STUB_RETENTION_DUE_HOURS ?? 0);
    const retentionWaiting = retentionDueHours > 0;
    // Set STUB_RETENTION_UNDATED to see the card's undated-deletion row and notice.
    const retentionUndated = Number(process.env.STUB_RETENTION_UNDATED ?? 0);
    return {
      status: 'ok',
      revision: 'cf17aa3c9f1b3a5e8d2c4b6a0f9e1d3c5b7a9f2e',
      serverTime: new Date(now).toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      clockGuard: {
        lastCheckedAt: new Date(now - 25_000).toISOString(),
        observedDriftMs: null,
        stale: false,
      },
      checks: {
        database: 'up',
        clock: 'up',
        clockGuard: 'up',
        identityVerification: 'up',
        sms: 'up',
        email: 'down',
        push: 'up',
        reconciliation: 'up',
        pushDispatch: 'up',
        accountRetention: retentionDueHours > 12 ? 'down' : 'up',
      },
      reconciliation: {
        runs: 7,
        inFlight: false,
        startedAt: sweptAt,
        lastRun: {
          finishedAt: sweptAt,
          durationMs: 842,
          payments: { checked: 3, settled: 1, unpaid: 2, failed: 0 },
          recorded: { checked: 5, replayed: 1, skipped: 4, failed: 0 },
          identity: { checked: 2, settled: 2, pending: 0, failed: 0 },
          error: null,
        },
        consecutiveFailures: 0,
        lastError: null,
        stale,
      },
      pushBacklog: {
        due: 2,
        abandoned: 0,
        oldestAt: new Date(now - 90_000).toISOString(),
        oldestAgeSeconds: 90,
        overdue: false,
      },
      accountRetention: {
        due: retentionWaiting ? 3 : 0,
        undated: retentionUndated,
        oldestDueAt: retentionWaiting
          ? new Date(now - retentionDueHours * 3_600_000).toISOString()
          : null,
        oldestOverdueSeconds: retentionWaiting ? Math.round(retentionDueHours * 3_600) : null,
        overdue: retentionDueHours > 12,
      },
      flags: { aiRecommendations: 'off' },
    };
  },
  '/api/v1/master-data/net-worth-categories': categories,
  '/api/v1/admin/admins': { admins: [self, other], nextCursor: null, hasMore: false },
  '/api/v1/admin/roles': roles,
  '/api/v1/admin/reports': { reports: [openReport], nextCursor: null, hasMore: false },
  '/api/v1/admin/reports/rep_1': openReport,
  '/api/v1/admin/data-requests': {
    requests: [overdue, done],
    nextCursor: 'dr_done',
    hasMore: true,
  },
  '/api/v1/admin/data-requests?status=REJECTED': { requests: [], nextCursor: null, hasMore: false },
  '/api/v1/admin/data-requests?cursor=dr_done': {
    requests: [done],
    nextCursor: null,
    hasMore: false,
  },
  '/api/v1/admin/data-requests/dr_overdue': overdue,
  '/api/v1/admin/data-requests/dr_done': done,
  '/api/v1/admin/users': {
    users: [
      {
        id: 'user_abc123',
        email: 'member@example.com',
        mobile: '9876543210',
        status: 'ACTIVE',
        createdAt: '2026-09-01T04:00:00.000Z',
      },
    ],
    nextCursor: 'user_abc123',
    hasMore: true,
  },
};

// Pricing versions: one in force (effectiveTo null) per band plus history.
const pricing = [
  {
    id: 'price_1',
    category: 'BELOW_1CR',
    baseAmount: '1999.00',
    gstRate: '0.1800',
    version: 1,
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: '2026-06-01T00:00:00.000Z',
    note: null,
    createdByAdminId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'price_2',
    category: 'BELOW_1CR',
    baseAmount: '2499.00',
    gstRate: '0.1800',
    version: 2,
    effectiveFrom: '2026-06-01T00:00:00.000Z',
    effectiveTo: null,
    note: 'Annual revision',
    createdByAdminId: 'admin_1',
    createdAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'price_3',
    category: 'ABOVE_2CR',
    baseAmount: '9999.00',
    gstRate: '0.1800',
    version: 1,
    effectiveFrom: '2026-02-01T00:00:00.000Z',
    effectiveTo: null,
    note: null,
    createdByAdminId: null,
    createdAt: '2026-02-01T00:00:00.000Z',
  },
];

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      // Mutations: log the request so the browser test can assert the payload.
      if (req.method !== 'GET') {
        console.log('MUTATION', req.method, req.url, body);
        if (req.url === '/api/v1/admin/auth/login') {
          const input = JSON.parse(body || '{}');
          if (input.email === 'mfa@example.com') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(
              JSON.stringify({
                mfa_required: true,
                challenge_token: 'challenge_1',
                expires_in: 300,
              }),
            );
            return;
          }
          if (input.password !== 'correct-horse-battery') {
            res.writeHead(401, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ message: 'Email or password is incorrect.' }));
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(sessionTokens()));
          return;
        }

        if (req.url === '/api/v1/admin/auth/refresh') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(sessionTokens()));
          return;
        }

        if (req.url === '/api/v1/admin/pricing') {
          const input = JSON.parse(body || '{}');
          const now = '2026-11-08T00:00:00.000Z';
          for (const row of pricing) {
            if (row.category === input.category && row.effectiveTo === null) {
              row.effectiveTo = now;
            }
          }
          const version = pricing.filter((row) => row.category === input.category).length + 1;
          const created = {
            id: `price_${pricing.length + 1}`,
            category: input.category,
            baseAmount: Number(input.baseAmount).toFixed(2),
            gstRate: (Number(input.gstPercent) / 100).toFixed(4),
            version,
            effectiveFrom: now,
            effectiveTo: null,
            note: input.note ?? null,
            createdByAdminId: 'admin_1',
            createdAt: now,
          };
          pricing.push(created);
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify(created));
          return;
        }
        // A profile decision. The API refuses a rejection without a reason, so
        // the stub does too — otherwise the console could look correct here and
        // fail against the real service.
        const decision = /^\/api\/v1\/admin\/profiles\/([^/]+)\/(approve|reject)$/.exec(req.url);
        if (decision) {
          const row = queueProfiles.find((profile) => profile.id === decision[1]);
          if (!row) {
            res.writeHead(404, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ message: 'Profile not found', statusCode: 404 }));
            return;
          }
          if (row.status !== 'PENDING_REVIEW') {
            res.writeHead(409, { 'content-type': 'application/json' });
            res.end(
              JSON.stringify({
                message: 'This profile is no longer awaiting review',
                statusCode: 409,
              }),
            );
            return;
          }
          if (decision[2] === 'reject') {
            const input = JSON.parse(body || '{}');
            if (typeof input.rejection_reason !== 'string' || !input.rejection_reason.trim()) {
              res.writeHead(400, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ message: 'rejection_reason should not be empty' }));
              return;
            }
            row.rejection_reason = input.rejection_reason.trim();
          }
          row.status = decision[2] === 'approve' ? 'APPROVED' : 'REJECTED';
          row.reviewed_at = new Date().toISOString();
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(row));
          return;
        }

        if (req.url === '/api/v1/admin/data-requests/dr_overdue/resolve') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ...overdue, ...JSON.parse(body || '{}') }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // One member, addresses anything under /admin/users/<id>, so it must run
      // before the list branch below.
      const detailPath = req.url.split('?')[0];
      const detailMatch = /^\/api\/v1\/admin\/users\/([^/]+)$/.exec(detailPath);
      if (detailMatch) {
        const detail = details[decodeURIComponent(detailMatch[1])];
        console.log('GET', req.url, detail ? 200 : 404);
        if (!detail) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ message: 'User not found', statusCode: 404 }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(detail));
        return;
      }

      // The member list needs real filtering to be worth testing.
      if (req.url.startsWith('/api/v1/admin/users')) {
        const url = new URL(req.url, 'http://stub');
        const q = url.searchParams.get('q');
        const status = url.searchParams.get('status');
        let rows = members;
        if (status) rows = rows.filter((row) => row.status === status);
        if (q) {
          const needle = q.toLowerCase();
          rows = rows.filter(
            (row) =>
              row.mobile.includes(needle) || (row.email ?? '').toLowerCase().includes(needle),
          );
        }
        console.log('GET', req.url, 200);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            users: rows,
            nextCursor: rows.length > 1 ? rows[0].id : null,
            hasMore: rows.length > 1,
          }),
        );
        return;
      }

      // Profile queue: oldest-first, the order the real endpoint uses, because
      // an unapproved profile is a member nobody can find.
      if (req.url.split('?')[0] === '/api/v1/admin/profiles') {
        const url = new URL(req.url, 'http://stub');
        const status = url.searchParams.get('status') ?? 'PENDING_REVIEW';
        const limit = Number(url.searchParams.get('limit') ?? 20);
        const cursor = url.searchParams.get('cursor');
        const rows = queueProfiles
          .filter((row) => row.status === status)
          .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
        const start = cursor ? rows.findIndex((row) => row.id === cursor) + 1 : 0;
        const page = rows.slice(start, start + limit);
        console.log('GET', req.url, 200);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            profiles: page,
            nextCursor: rows.length > start + limit ? page[page.length - 1].id : null,
            hasMore: rows.length > start + limit,
          }),
        );
        return;
      }

      if (req.url.split('?')[0] === '/api/v1/admin/pricing') {
        console.log('GET', req.url, 200);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(pricing));
        return;
      }

      const route = routes[req.url];
      console.log(req.method, req.url, route ? 200 : 404);
      if (!route) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: 'not found in stub: ' + req.url }));
        return;
      }
      // A function route is built at request time, for payloads whose values are
      // relative to now (the system health report's uptime and sweep timestamps).
      const payload = typeof route === 'function' ? route() : route;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  })
  .listen(PORT, '127.0.0.1', () =>
    console.log(`stub admin api on http://127.0.0.1:${PORT}/api/v1`),
  );
