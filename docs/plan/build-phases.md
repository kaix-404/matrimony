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

## Phase 3 — Discovery

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

## Phase 4 — Payments and unlock delivery

Razorpay order creation with amount snapshotted from `pricing_config`, webhook
handling with idempotency on `WebhookEvent`, and `ContactUnlock` creation only
from a `SUCCESS` payment. Includes the ₹15 setup-fee path and the 24-hour
expiry, plus the 2-hour reminder the scheduler will fire.

## Phase 5 — Trust and safety

Reports, blocking, admin moderation queue, suspension and deletion flows
including the retention-then-anonymise behaviour in section 21.

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
