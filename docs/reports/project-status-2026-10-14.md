PROJECT STATUS TILL NOW

Matrimony App - Monorepo Implementation

Date: October 14, 2026
Branch: main (39b1864)

GATES
- All 793 tests pass (232 shared + 29 admin + 532 API)
- Typecheck: PASS (workspaces + tools, including the seed)
- Lint: PASS
- Build: PASS (shared + API + admin)
- CI build blocker resolved: the shared barrel now exports the notifications and
  admin contracts, and the enum name collision that broke the shared build is fixed

COMPLETED PHASES
- Phase 1-5: Core auth, profile, discovery, payments, moderation, unlocks
- Phase 6: Identity Verification (KYC) - contracts, service, controller, module aligned
- Phase 7: Notifications - shared contracts, API service/controller/module, wired into
  the app; member list endpoint (GET /notifications); tests added
- Phase 7 (section 15 / C3): unlock pre-expiry reminder
  * UNLOCK_EXPIRY_REMINDER_HOURS was configured but unused, so an unlock went quiet
    until it lapsed; a sweep now records an IN_APP notification per unlock two hours
    before it expires
  * ContactUnlock.reminderSentAt marks a reminder sent; the claim is a conditional
    update, so a second sweep, a redeploy or a second instance cannot notify twice
  * UnlockExpiryReminder follows the existing sweeper/ClockDriftGuard timer shape
    (5-minute interval, unref, boot sweep, failures logged not thrown)
  * Channel is IN_APP because no push transport is wired; a push provider added later
    reads the same rows
- Phase 1 (OTP delivery): MSG91 SMS sender - resolves GAP-12
  * SmsGateway seam (abstract class) with a Msg91SmsGateway on MSG91's Flow API,
    bound like the payment gateway so tests substitute it without the network; a
    small SmsModule keeps the graph acyclic for both Auth and Notifications
  * AuthController.requestOtp sends the code via MSG91 in production and fails
    closed (401) when MSG91 is unconfigured; outside production it still echoes
    dev_code so the flow stays testable without a provider account
  * Flow API rather than MSG91's SendOTP API, because the platform already owns OTP
    state (hashed, attempt-counted, expired, consumed at later steps); the code
    travels as a template variable and MSG91 only delivers it
  * New config SMS_TEMPLATE_ID / SMS_OTP_TEMPLATE_VAR / SMS_COUNTRY_CODE; 9 gateway tests
- Phase 8 (foundation): Admin RBAC
  * Shared permission catalogue (21 keys) plus ADMIN_ROLE_SLUGS, single source of truth
  * @RequirePermission decorator and PermissionsGuard (permission-based, resolved from
    role grants on every request)
  * AdminAuthGuard and AdminTokenService (`typ: admin_access`, separated from member
    tokens so the two can never be exchanged)
  * Admin email/password login (scrypt-hashed), rotating admin refresh tokens with
    reuse detection, logout, and an optional bootstrap Super Admin created from
    SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
  * Role management (admin:manage): list roles/administrators, create an administrator,
    grant and revoke roles. Refuses self role-changes and revoking the last Super Admin
  * Enrichment tooling, each audited: category change (user:change_category),
    pricing publish (pricing:write, append-only versioning), manual unlock grant
    (unlock:grant, recorded as AdminGrantAudit because ContactUnlock requires a
    verified payment; UnlockService honours an active grant for the 24-hour window
    and lists it for the buyer), and data-request handling (data_request:handle)
  * AuditService (append-only AuditLog writer, section 32)
  * AdminModule wired into the app; seed consumes the shared catalogue
- Phase 8 (AI recommendations, backend MVP): curated interests + feature-flagged For You feed
  * Shared catalogue of lifestyle interest tags (DEFAULT_INTERESTS) and contracts for
    interests and recommendations, with a 30-interest cap and whole-set replacement
  * Interest and ProfileInterest tables plus migration; curated interests seeded
  * Member endpoints GET/PUT /profile/interests (curated list only, client answer 1)
  * GET /recommendations behind FEATURE_AI_RECOMMENDATIONS (answer 7); an empty enabled
    feed is returned when the flag is off rather than an error
  * Content-based hybrid ranking (answer 2): candidates reuse the existing discovery
    eligibility and two-way acceptance scope, ranked by shared-interest overlap; cards
    expose shared_interests as an optional explanation (answers 4 and 6)
  * FeatureFlagsService (env-backed) and reusable DiscoveryService scope helpers
- Phase 8 (admin MFA): TOTP second factor for administrators
  * Hand-rolled RFC 6238 TOTP (SHA-1, 6 digits, 30-second step, +/-1 step
    tolerance) on node:crypto, and an AES-256-GCM SecretBox for the secret at rest
    under a dedicated MFA_ENCRYPTION_KEY - no new dependency
  * Opt-in self-service enrollment: the pending secret rides a signed 10-minute
    mfa_enroll token and is persisted only after a matching code, so a stored
    secret always means a working second factor
  * Login for an MFA-enabled admin returns a signed 5-minute challenge
    (mfa_required / challenge_token / expires_in) instead of a token pair; only
    POST /admin/auth/mfa/verify issues the pair
  * A wrong code charges the same lockout counter as a wrong password (five total,
    15-minute lock); disable requires a current code; token types are separated by
    typ (admin_access / mfa_challenge / mfa_enroll)
  * Lost-device recovery: POST /admin/admins/:id/mfa/reset (admin:manage, audited,
    refuses self-reset); AdminUserView gains mfaEnabled
- Phase 5 (trust and safety, section 30): report moderation queue
  * GET /admin/reports (status filter + cursor pages), GET /admin/reports/:id and
    POST /admin/reports/:id/review, all behind report:review
  * A resolution is terminal and pairs action with status (DISMISS<->DISMISSED,
    other actions<->ACTIONED); notes are required to action
  * SUSPEND suspends the reported account as its only side effect, guarded so a
    moderation decision cannot revive a DELETED account; WARN/BLOCK/DELETE are
    recorded for the audit trail; every review writes a report:review audit row
  * Shared REPORT_STATUSES / REPORT_ACTION_TYPES enums and AdminReportView /
    AdminReviewReportSchema contracts
- Phase 8 (Next.js admin dashboard): the in-repo operator console
  * apps/admin, a Next.js 16 (App Router) + React 19 workspace (@matrimony/admin)
    that talks only to the admin API and holds no business logic of its own
  * Backend-for-frontend auth: the token pair lives only in httpOnly cookies, so the
    browser never sees a token; an edge proxy (proxy.ts) guards every route and
    refreshes the access token before it expires, making a 15-minute token invisible
  * Password-then-TOTP login and session route handlers that re-validate every API
    response with the shared Zod contracts before trusting it
  * Pages: overview, the section-30 moderation queue (status filter plus a detail
    view with a review form), the member list, and the administrator/role list
  * Build pinned to webpack (Next 16 defaults to Turbopack, which panics writing
    this app's route chunks on Windows); a small pure-helper suite runs under Jest

PENDING
- Phase 9: Mobile app (React Native)

NOTES
- Admin routes are now reachable end to end: login issues a token that the
  AdminAuthGuard accepts and the PermissionsGuard checks against seeded grants
- The permission catalogue now lives in @matrimony/shared and is consumed by the seed,
  removing the drift between guard keys and seeded grants
- Recommendations inherit the discovery eligibility and two-way acceptance rules, so the
  For You feed can never surface a profile the member could not already see
- Admin MFA fails closed: a rotated MFA_ENCRYPTION_KEY reads as "no usable secret"
  rather than admitting a login with an unverifiable factor, and a session alone cannot
  disable the second factor
- The moderation queue returns ids and the report text, never a name or photograph, so
  it cannot re-leak a section-13 hidden field; a resolution is terminal so a recorded
  sanction cannot be silently rewritten by a second reviewer
- The dashboard holds no admin logic: every list and mutation is a thin call to the
  API, so the permission checks and the audit trail that guard those routes stay the
  only authority and a dashboard bug cannot widen what an operator can do
- Admin tokens never reach client JavaScript - they live only in httpOnly cookies
  that the server and the edge proxy read, so an XSS on the dashboard cannot lift a
  session
- OTP delivery fails closed: with MSG91 unconfigured a production request is refused
  rather than answered 200 for a code that never left, and the vendor never sees the
  OTP hash, attempts or expiry - it is handed only a bare code to deliver
- The MSG91 authkey was shared out of band and should be rotated before production;
  the MSG91 sender id, template id and DLT registration are the client's to supply,
  so a real send has not yet been exercised end to end
- The unlock reminder is idempotent on the row, not on the timer: reminderSentAt is
  stamped by a conditional update, so a restart or a second instance cannot send the
  same reminder twice
- The reminder is recorded, not pushed: with no push transport wired the buyer sees it
  only when they open the app, so whether push is in scope for launch is a client call
- No breaking changes
