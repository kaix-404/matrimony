# Build phases

Derived from the Internal Developer Work Document (section 45, Development
Checklist) and the three decision logs in `docs/decisions`. Each phase is
independently deployable and leaves the system in a working state; nothing is
built "in place" of a later phase.

Ordering is driven by what unlocks what, not by what looks impressive. Identity
comes before discovery because a user without a category cannot be returned by any
query, and payments come before unlock delivery because the schema forbids an
unlock without a settled payment.

## Phase 0 — Foundations ✅

Monorepo, shared contracts, the full 29-table schema, config validation,
security headers, rate limiting, clock service with drift guard, health probes,
CI that boots the API against a real PostgreSQL 16. Client supplier decisions
recorded (`03ed948`).

## Phase 1 — Identity and registration ✅

The only way into the product, and the only phase where the golden rules in
section 36 can still be violated by a caller.

- OTP request and verify. Mobile is the sole identifier (section 6). Codes are
  stored hashed, never in plaintext; cooldown and attempt limits are enforced
  server-side from `OtpRequest`, not from a client timer.
- Registration completes the category assignment. The category is chosen once,
  server-controlled, and immutable afterwards except by audited admin action.
- Access JWT (15 min) plus opaque refresh token with rotation. Only the hash is
  persisted. Reuse of a rotated token revokes the whole family — that is what
  makes a stolen refresh token detectable instead of indefinitely useful.
- Login, logout, refresh, and `GET /auth/me`.
- Account lockout on repeated failures, `lockedUntil` from server time.

Exit criteria: a user can register, log in, refresh, log out, and every path is
covered by tests including the expiry boundaries.

Three holes found in review were closed in `ed824e1`: a verified registration OTP
could be replayed to obtain a session for an already-registered number, the lockout
was never called from the request path, and refresh rotation ignored suspension.

## Phase 2 — Profile and master data ✅

Profile CRUD with per-section validation, admin-configurable `ProfileAttribute`
values, master-list endpoints (community, education, profession), and photo
upload to S3-compatible storage with presigned URLs. Photos are never locked
behind payment and only `APPROVED` photos reach another user.

## Phase 3 — Discovery ✅

The read path. Candidates are selected by the **two-way** visibility rule rather
than a category partition: the viewer's discovery selection must include the
target's category, and the target's allowed-viewer selection must include the
viewer's category. Both lists are user-editable and default to the user's own
category, so nothing widens without the user asking (see
[`visibility-discoverability-2026-10-03.md`](../decisions/visibility-discoverability-2026-10-03.md)).

Eligibility gates still apply (verified, setup fee paid, active, not deleted, not
blocked in either direction), plus filters from `PartnerPreference` and cursor
pagination. Net worth is never a filter. Profile previews are built by explicit
projection, never a spread, so the section 13 hidden-field rule is enforced by the
shape of the response rather than by review.

Unlock price is derived from the **target's** category, so it is known before
checkout and is snapshotted onto the payment row when taken.

Shipped in `fd0051c`, verified against a real PostgreSQL 16 as well as in unit
tests. Three defects were only reachable through that live run and are now
covered: a Decimal read through Prisma's driver adapter failed `instanceof` and
threw on every priced response; `?limit=1` was rejected because query parameters
arrive as strings; and `preference_applied` echoed a flag that could not actually
change the scope. Discovery ordering is newest-first; GAP-3 (newest versus
closest) is still open and is the one input needed before payments are built.

## Phase 4 — Payments and unlock delivery ✅

Razorpay order creation with amount snapshotted from `pricing_config`, webhook
handling with idempotency on `WebhookEvent`, and `ContactUnlock` creation only
from a `SUCCESS` payment. Includes the ₹15 setup-fee path and the 24-hour
expiry. The 2-hour reminder is not delivered here: it belongs to the notification
scheduler, and it landed with Phase 7 (`UNLOCK_EXPIRY_REMINDER_HOURS`).

## Phase 5 — Trust and safety

Sections 19-21. Blocking, reporting, deletion, data requests and the admin review
queue are all built.

Built:

- `POST /blocks`, `DELETE /blocks/:profileId`, `GET /blocks` — section 19's
  block, unblock, and blocked-profile management behind Settings. Idempotent in
  both directions. The entry carries a photo but never a name: section 13
  withholds the name until payment and the discovery card never carried one, so
  blocked is not unlocked. Discovery and the unlock guard already excluded a
  blocked pair, so a block takes effect on the next request with nothing to
  invalidate and no cache to propagate.
- `GET /reports/reasons`, `POST /reports` — section 20's intake. The reason list
  is admin-configurable and the client only ever sends a `reason_id`; a reason
  retired since the form was rendered answers 404 rather than filing under a
  code the dashboard no longer filters on. An identical still-open report is
  collapsed rather than appended, because the moderation queue is itself a spam
  surface and a client retry is indistinguishable from a second tap. A resolved
  one is not collapsed — conduct that continued after a dismissal is a new
  incident.
- Both enforce the section 12 rule that a profile id from another net-worth band
  answers 404 rather than 403. The distinction would confirm that an id exists
  in a band the caller was never shown.
- `POST /data-requests`, `GET /data-requests` — section 21's access right, from
  the member's side. The admin queue could list and resolve `DataRequest` rows,
  but nothing in the product could create one, so every entry in it had to be
  written by hand. Both routes are scoped by the token subject and there is no
  `/data-requests/:id`. Only `EXPORT` is requestable: erasure is already
  `POST /account/delete`, behind an OTP, and a second erasure path would file a
  request that nothing performs. The row carries a `dueAt` 30 days out, computed
  from server time, because the deadline promised when the request was filed is
  what the queue sorts by. Filing twice while one is open returns the open
  request instead of a second row, and a resolved request does not block a new
  one — wanting a fresh copy later is a new request, not a duplicate. Nothing
  generates the archive: producing it stays an administrative act.

The admin review queue landed with Phase 8 rather than here, because it could
not start before an admin could authenticate.

Section 21 deletion is built: `POST /account/delete` soft-deletes the user,
profile and live sessions behind an OTP, and `AccountRetentionSweeper` erases the
PII once `purgeAfter` (`DELETED_ACCOUNT_RETENTION_MONTHS`) has passed — the mobile
becomes a per-account tombstone so the real number can register again, while the
payment and unlock records section 21 retains are left untouched.

## Phase 6 — Identity verification

Cashfree Secure ID with the consent-based DigiLocker flow. Only the provider
reference and last four digits are persisted. The user cannot be discovered
until this passes (D9).

## Phase 7 — Notifications

Section 42 event set across push (FCM HTTP v1), SMS (DLT-gated), email, and
in-app, with the 2-hour unlock-expiry reminder.

Built:

- Push delivery over FCM HTTP v1 with a claiming sweeper: a `PENDING` row is
  flipped to `SENDING` before the provider is called, so two workers cannot send
  it twice, and a row left `SENDING` by a crashed worker is requeued once stale.
- `GET /notifications`, the in-app list. Not filtered by channel, so a pushed
  message is also readable in the app.
- The C3 reminder: a sweep claims unlocks whose window closes within
  `UNLOCK_EXPIRY_REMINDER_HOURS` (default 2) and records one
  `UNLOCK_EXPIRING_IN_2H` row per unlock, guarded on `reminderSentAt`.
- `IDENTITY_VERIFIED` and `IDENTITY_VERIFICATION_FAILED`, written when a
  DigiLocker webhook moves a check to a new outcome. Announcing is keyed on the
  status _before_ the update, so a replayed delivery says nothing twice, and the
  failure notice does not repeat the vendor's reason string — it is a message
  about a document, and the member's next step is the same whatever it says.
- `PAYMENT_SUCCESSFUL` and `SETUP_FEE_PAID`, both written after the payment
  webhook's transaction commits and only when that delivery actually granted
  something: a repeat event grants nothing, so it cannot notify twice, and a
  capture whose target vanished (GAP-1) notifies nobody. Notification failure is
  logged rather than thrown, because the money is already settled and a webhook
  retried over a missing courtesy is worse than the missing courtesy.

Remaining:

- The `EMAIL` channel has no vendor behind it, so a row written on it would sit
  `PENDING` forever. Nothing writes one today.
- Emitting the rest of the event set: `PROFILE_APPROVED`, `PROFILE_REJECTED`,
  `REPORT_ACTION_TAKEN`, `UNLOCK_EXPIRED` and `ACCOUNT_SUSPENDED` are declared
  and never sent.

## Phase 8 — Admin API and dashboard ✅

RBAC by permission rather than role name (section 33), audit logging on every
mutating admin action, master-data and pricing management, and the Next.js
dashboard.

The API side shipped first: the permission catalogue in `@matrimony/shared`, a
`PermissionsGuard` that resolves grants on every request, separated `admin_access`
tokens, password login with rotating refresh tokens, role management that refuses
self-lockout and the loss of the last Super Admin, audited enrichment tooling,
TOTP MFA (`admin-mfa-2026-10-14.md`), and the section-30 moderation queue.

`apps/admin` is the console: a Next.js 16 App Router client whose tokens live only
in `httpOnly` cookies and whose edge proxy refreshes them before they expire. It
holds no business logic, so the API remains the only authority
(`admin-dashboard-2026-10-14.md`).

## Phase 9 — Mobile app

React Native client against the contracts in `packages/shared`.

## Cross-cutting, enforced every phase

Request validation via the shared Zod schemas, no field reaching the app that
the app is not authorised to see, secrets only from the environment, and
`npm run verify` green before anything is committed.
