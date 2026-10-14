# Design decisions - the admin dashboard (Next.js), 2026-10-14

Phase 8's last piece: a browser console for the admin API that already exists.
This records how the dashboard is built and, more importantly, what it is
deliberately *not* allowed to be.

## Decisions

- **It is a thin client, and the API stays the only authority.** `apps/admin`
  (`@matrimony/admin`) holds no business logic. Every list and mutation is a call
  to the admin API, so the `PermissionsGuard` and the audit trail that guard those
  routes remain the single place an authorisation decision is made. A bug in the
  dashboard can lose a button; it cannot widen what an operator is permitted to do.

- **Authentication is a backend-for-frontend; the browser never holds a token.**
  The access and refresh tokens live only in `httpOnly` cookies (`mny_admin_at`,
  `mny_admin_rt`) that JavaScript cannot read. A third, readable cookie
  (`mny_admin_email`) carries the display name only. The route handlers under
  `/api/session/{login,mfa,logout}` are the only code that touches a token: they
  proxy to the API, then set or clear the cookies. The consequence is that an XSS
  on the dashboard cannot lift a session, and an access token never appears in a
  URL, a log, or `localStorage`.

- **`proxy.ts` (Next's renamed middleware) is a gate, not an authoriser.** It
  redirects a request with no refresh token to `/login`, and, when the access token
  is spent or within a 60-second skew of expiring, exchanges the refresh token for
  a new pair before the page renders. That is why the 15-minute access token is
  invisible to an administrator. The token is *decoded, never verified* - the API
  checks every signature - so the gate is a UX and routing decision, not a security
  boundary. It runs on the Edge runtime and imports nothing from Node or
  `next/headers`.

- **Every API response is re-validated against the shared contracts.** The session
  route handlers parse what the API returns with the same Zod schemas the API
  enforces (`AdminLoginSchema`, `AdminMfaChallengeSchema`, `AdminTokenPairSchema`,
  the MFA verify schema), and the review form reuses `AdminReviewReportSchema`. The
  dashboard trusts the *shape* the shared package describes, not an untyped
  `response.json()`.

- **Login is password, then TOTP, in one form.** Because an MFA-enabled admin's
  login answers with `mfa_required` plus a challenge token rather than a session
  (see `admin-mfa-2026-10-14.md`), the login form is a two-step client that keeps
  the challenge token in memory and submits it with the code. There is no separate
  MFA URL to fall out of sync with the first step.

- **Data pages are `force-dynamic`; nothing session-shaped is prerendered.** The
  overview and every list opt out of static rendering, because at build time there
  is no session and therefore nothing correct to render. Only `/login` and the
  not-found page are static.

- **Plain CSS, no component library.** The dashboard is a handful of tables and
  forms; a design system would add a dependency and a build step for no benefit.
  Styling is one hand-written `globals.css`.

- **The build is pinned to webpack (`next build --webpack`).** Next 16 defaults to
  Turbopack, which panics writing this app's route chunks on Windows ("failed to
  convert rope into string / invalid utf-8 sequence", a source-map generation bug -
  reproducible with an empty source tree). Webpack builds the identical app cleanly,
  so the engine is pinned in the scripts to keep local and CI builds in agreement.
  `dev` is pinned the same way.

- **ESLint is intentionally non-type-aware.** Type-aware rules such as
  `no-misused-promises` fire on ordinary JSX `onClick={asyncFn}` handlers and
  fight the App Router's conventions. Type safety is already enforced by
  `tsc --noEmit` in `typecheck`, so linting here is about the *shape* of the code,
  not the types.

## Interaction with existing decisions

- **Reuses the admin API's token separation.** The dashboard consumes
  `admin_access` tokens; it never sees a member token, and the challenge/enroll
  tokens it forwards are accepted by exactly one API endpoint each.
- **No new API surface.** The dashboard is a consumer only; this change adds no
  endpoint, no contract and no migration.
- **Tested where testing is cheap.** The 29 tests are the pure helpers (label maps,
  action/status pairing, form validation, payload building, JWT claim decoding,
  error shaping). The pages are thin call-and-render wrappers over the API, which
  carries its own 512 tests.
