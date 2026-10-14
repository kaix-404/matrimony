PROJECT STATUS TILL NOW

Matrimony App - Monorepo Implementation

Date: October 14, 2026
Branch: main (a521e3b)

GATES
- All 619 tests pass (192 shared + 427 API)
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
  * AuditService (append-only AuditLog writer, section 32)
  * AdminModule wired into the app; seed consumes the shared catalogue

PENDING
- Phase 8 (remaining): admin MFA (schema field exists), moderation/pricing/data-request
  tooling (audited category change, manual unlock grant, pricing publish)
- Phase 9: Mobile app (React Native)

NOTES
- Admin routes are now reachable end to end: login issues a token that the
  AdminAuthGuard accepts and the PermissionsGuard checks against seeded grants
- The permission catalogue now lives in @matrimony/shared and is consumed by the seed,
  removing the drift between guard keys and seeded grants
- No breaking changes
