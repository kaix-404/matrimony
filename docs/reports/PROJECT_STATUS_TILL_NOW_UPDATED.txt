PROJECT STATUS TILL NOW

Matrimony App - Monorepo Implementation

Date: October 14, 2026
Branch: main (6c14c08)

GATES
- All 729 tests pass (227 shared + 502 API)
- Typecheck: PASS (workspaces + tools, including the seed)
- Lint: PASS
- Build: PASS (shared + API)
- CI build blocker resolved: the shared barrel now exports the notifications and
  admin contracts, and the enum name collision that broke the shared build is fixed

COMPLETED PHASES
- Phase 1-5: Core auth, profile, discovery, payments, moderation, unlocks
- Phase 6: Identity Verification (KYC) - contracts, service, controller, module aligned
- Phase 7: Notifications - shared contracts, API service/controller/module, wired into
  the app; member list endpoint (GET /notifications); tests added
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
- No breaking changes
