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
expiry. The 2-hour reminder is not delivered here: it belongs to the
notification scheduler, so it lands with Phase 7, where the lead time already
exists as C3 (`UNLOCK_EXPIRY_REMINDER_HOURS`).

## Phase 5 — Trust and safety

Sections 19-21. Blocking and reporting are built; section 21's deletion flow and
the admin review queue are not.

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

Remaining:

- Section 21 deletion: soft delete, retention-then-anonymise, and invalidating
  active profile access. The OTP purpose and `DELETED_ACCOUNT_RETENTION_MONTHS`
  already exist.
- The admin review queue. It cannot start before an admin can authenticate —
  `AdminUser` and `AdminRole` exist in the schema with no service behind them —
  so it needs a sequencing decision against Phase 8's RBAC work.

## Phase 6 — Identity verification

Cashfree Secure ID with the consent-based DigiLocker flow. Only the provider
reference and last four digits are persisted. The user cannot be discovered
until this passes (D9).

## Phase 7 — Notifications

Section 42 event set across push (FCM HTTP v1), SMS (DLT-gated), email, and
in-app, with the 2-hour unlock-expiry reminder.

## Phase 8 — Admin API and dashboard

RBAC by permission rather than role name (section 33), audit logging on every
mutating admin action, master-data and pricing management, and the Next.js
dashboard.

## Phase 9 — Mobile app

React Native client against the contracts in `packages/shared`.

## Cross-cutting, enforced every phase

Request validation via the shared Zod schemas, no field reaching the app that
the app is not authorised to see, secrets only from the environment, and
`npm run verify` green before anything is committed.
