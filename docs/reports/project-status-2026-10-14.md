PROJECT STATUS TILL NOW

Matrimony App - Monorepo Implementation

Date: October 21, 2026
Branch: main (43bde17)

GATES
- All 830 tests pass (236 shared + 29 admin + 565 API)
- Typecheck: PASS (workspaces + tools, including the seed and the mobile app)
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
    until it lapsed; a sweep now records a notification per unlock two hours before it
    expires
  * ContactUnlock.reminderSentAt marks a reminder sent; the claim is a conditional
    update, so a second sweep, a redeploy or a second instance cannot notify twice
  * UnlockExpiryReminder follows the existing sweeper/ClockDriftGuard timer shape
    (5-minute interval, unref, boot sweep, failures logged not thrown)
  * Channel is PUSH; once push delivery landed (below) the reminder moved off IN_APP so
    a registered device is actually nudged, and the row still shows in the in-app list
- Phase 7 (section 42): push delivery over Firebase - resolves GAP-12's push half
  * The client chose Firebase on 2026-10-01; FCM HTTP v1 with a service-account
    assertion (RS256 JWT exchanged for a cached OAuth2 token) on node:crypto, not the
    deprecated legacy server key and not firebase-admin
  * PushGateway seam bound to FcmPushGateway in PushModule (substitutable in tests, so
    nothing outside the gateway reaches FCM); fails closed when unconfigured
  * DeviceToken model + DevicePlatform enum; NotificationStatus gains SENDING for the
    in-flight claim; migration 20261014140000_device_tokens_push
  * POST/GET /devices and DELETE /devices/:token under JwtAuthGuard; registration
    upserts on the token and reassigns its owner, and the token is never echoed back
  * PushDispatchService claims a row PENDING -> SENDING with a conditional update so two
    workers (or instances) cannot both send it, requeues a stale SENDING row, prunes a
    token FCM reports UNREGISTERED, and marks SENT/FAILED; PushDispatchSweeper runs on a
    60-second timer
  * A PUSH row for a member with no device stays PENDING and is delivered once one is
    registered, so nothing is lost
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

- Phase 9 (mobile app): Expo SDK 57 + React Native 0.86 member app
  * apps/mobile (@matrimony/mobile): Expo Router, strict TypeScript, consuming the
    @matrimony/shared contracts; the typed API client validates request bodies and
    responses with Zod and refreshes a 401 once before failing
  * Auth and onboarding: phone OTP request/verify, registration, rotating tokens in
    expo-secure-store, a useRequireAuth gate, and profile creation with completeness
  * Discovery: cursor-paginated infinite feed of locked cards; temporary filters
    (age, height, city, state, education, profession, verified photos) and sort are
    applied per request from a bottom sheet, and the API now parses the nested
    filter query objects (Express 5 defaults to the simple parser)
  * Member previews and payments: locked/unlocked/expired states, Razorpay checkout
    in a WebView with the order key_id, GET /payments/:id polling, and unlock expiry
    surfaced in the matches tab; no client-side capture endpoint was added
  * Account setup fee: the verification webhook moves a verified account to
    AWAITING_SETUP_FEE (guarded so a replay cannot pull an ACTIVE account back); the
    home feed gates until payment and a dedicated screen quotes Rs 15.00 + 18% GST
    = Rs 17.70
  * Profile: completeness, field editing with a diff PATCH, direct-to-storage photo
    upload with primary/delete management, and a visibility toggle
  * Settings: net-worth discover/visible-to preference editor, sign out, and
    OTP-confirmed account deletion
  * Notifications: in-app list with unread badges and push registration through
    expo-notifications -> POST /devices (dead tokens pruned server-side)
  * For You: fifth tab with a curated interest picker and recommendation cards
    showing shared interests; the server flag (FEATURE_AI_RECOMMENDATIONS, off by
    default) drives a coming-soon state rather than an error

PENDING
- Email provider still open (the remaining half of GAP-12; SMS and push are resolved)
- Device-level QA and the store identifiers (bundleIdentifier / Android package)

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
- Push delivery is at-least-once and never twice-per-worker: a notification is only
  sent after a conditional PENDING -> SENDING claim wins, and a row stranded by a
  crashed worker is requeued once it is stale, so scaling the API past one instance
  cannot double-send
- A dead push token is a lifecycle event, not an outage: FCM's UNREGISTERED answer
  prunes the device rather than marking the notification FAILED, so an uninstalled app
  cannot strand the queue
- Push content passes through Google, so it carries ids and event keys, never a name or
  photograph; the device token is never echoed in a response, keeping it out of bodies
  and access logs
- Push and the registration endpoints fail closed: with FCM_SERVICE_ACCOUNT_JSON empty
  the dispatcher leaves the queue untouched and a PUSH row stays visible in the in-app
  list
- No real FCM send has been exercised: the credential is not in the environment, so the
  gateway is unit-tested against a mocked fetch; the client has an Admin SDK JSON on
  hand for a live check, and the MSG91 authkey should still be rotated before production
- The mobile app never confirms a payment itself: checkout only polls the payment
  row, so an unlock or setup-fee activation still requires the HMAC-verified webhook
- The setup-fee transition is guarded on PENDING_VERIFICATION, so a replayed or late
  verification event cannot reopen or downgrade an account that already moved on
- Express 5 defaults to the simple query parser, which would read filters[age_min]
  as one literal key; the API now sets "extended" explicitly, with a boot test
- For You is shipped dark: the flag returns enabled:false and the app shows a
  coming-soon state, so enabling it is a configuration change, not a release
- No breaking changes
