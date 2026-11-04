"use strict";
/**
 * Domain enums — single source of truth.
 *
 * These mirror the Prisma enums in apps/api/prisma/schema.prisma. They are
 * declared here (rather than imported from the generated client) so the mobile
 * app can depend on the same vocabulary without pulling in the server package.
 *
 * A unit test asserts that this list and the Prisma enums stay in sync.
 *
 * NET WORTH CATEGORIES ARE DELIBERATELY NOT HERE. The client confirmed four
 * bands on 2026-09-29 and has said more are coming, so the category is data in
 * the `net_worth_category_ref` table, not a compile-time union. Hardcoding a
 * union here would force a mobile release every time a band is added. The
 * selector takes its options from the API instead.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_ROLE_SLUGS = exports.ADMIN_DASHBOARD_WIDGETS = exports.UNLOCK_EXPIRY_REMINDER_HOURS = exports.NOTIFICATION_EVENTS = exports.DATA_REQUEST_STATUSES = exports.DATA_REQUEST_TYPES = exports.DEVICE_PLATFORMS = exports.NOTIFICATION_CHANNELS = exports.REPORT_ACTION_TYPES = exports.REPORT_STATUSES = exports.DEFAULT_REPORT_REASON_CODES = exports.MARITAL_STATUSES = exports.GENDER_PREFERENCES = exports.GENDERS = exports.UNLOCK_STATUSES = exports.SETTLED_PAYMENT_STATUSES = exports.PAYMENT_STATUSES = exports.PHOTO_TYPES = exports.PHOTO_STATUSES = exports.PROFILE_VISIBILITIES = exports.PROFILE_STATUSES = exports.NET_WORTH_PENDING_REVIEW_KEY = exports.SEEDED_NET_WORTH_CATEGORY_KEYS = void 0;
/**
 * Seeded band keys. These are the four the client confirmed, kept only as
 * documentation and as the expected starting point asserted by the seed.
 * Runtime code must not branch on these — read the table.
 */
exports.SEEDED_NET_WORTH_CATEGORY_KEYS = [
    'BELOW_2CR',
    'TWO_CR_TO_FIVE_CR',
    'FIVE_CR_TO_TEN_CR',
    'ABOVE_10CR',
    'PENDING_REVIEW',
];
/**
 * The fallback bucket for a value that falls in no band and needs admin review.
 *
 * GAP-2 (closed 2026-10-23, client answer 5) confirmed that a value exactly on a
 * boundary goes *up* into the higher band, so this bucket is not what a boundary
 * value lands in; it is the fail-closed home for anything a band cannot place.
 */
exports.NET_WORTH_PENDING_REVIEW_KEY = 'PENDING_REVIEW';
exports.PROFILE_STATUSES = [
    'DRAFT',
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED',
    'SUSPENDED',
    'DELETED',
];
exports.PROFILE_VISIBILITIES = ['ACTIVE', 'PAUSED', 'HIDDEN'];
exports.PHOTO_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'];
/** D1: single-person and family group photos are both accepted, and a family
 * photo may contain several faces — so screening cannot assume one face per
 * image. The app states which it is uploading rather than letting moderation
 * guess. */
exports.PHOTO_TYPES = ['SINGLE', 'FAMILY'];
exports.PAYMENT_STATUSES = [
    'CREATED',
    'PENDING',
    'SUCCESS',
    'FAILED',
    'CANCELLED',
    'REFUND_PENDING',
    'REFUNDED',
    'PARTIALLY_REFUNDED',
];
/** Section 40: only these states authorise the creation of a ContactUnlock. */
exports.SETTLED_PAYMENT_STATUSES = ['SUCCESS'];
exports.UNLOCK_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'];
exports.GENDERS = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'];
exports.GENDER_PREFERENCES = ['MALE', 'FEMALE', 'ANY'];
exports.MARITAL_STATUSES = [
    'NEVER_MARRIED',
    'DIVORCED',
    'WIDOWED',
    'AWAITING_DIVORCE',
    'ANNULLED',
];
/** Section 20 defaults. Admin-managed via the ReportReason table. */
exports.DEFAULT_REPORT_REASON_CODES = [
    'FAKE_PROFILE',
    'INCORRECT_INFORMATION',
    'INAPPROPRIATE_CONTENT',
    'INCORRECT_CONTACT',
    'HARASSMENT',
    'OTHER',
];
/**
 * Section 30 report lifecycle. `OPEN` is intake, `IN_REVIEW` is an administrator
 * having picked it up, and `DISMISSED`/`ACTIONED` are the two terminal states a
 * moderation decision lands on.
 */
exports.REPORT_STATUSES = ['OPEN', 'IN_REVIEW', 'DISMISSED', 'ACTIONED'];
/**
 * Section 30 moderation actions. Only `SUSPEND` currently carries an automatic
 * side effect (the reported account is suspended); the rest are recorded on the
 * report for the audit trail.
 */
exports.REPORT_ACTION_TYPES = ['DISMISS', 'WARN', 'SUSPEND', 'BLOCK', 'DELETE'];
exports.NOTIFICATION_CHANNELS = ['PUSH', 'SMS', 'EMAIL', 'IN_APP'];
/**
 * Section 42 push delivery (client decision 2026-10-01: Firebase). The platform
 * a device belongs to, recorded so a send can be scoped or metered per store and
 * so an iOS-only or Android-only credential change is visible. `WEB` is included
 * because FCM serves web push too, even though the first client is mobile.
 */
exports.DEVICE_PLATFORMS = ['ANDROID', 'IOS', 'WEB'];
/**
 * Section 21/32 data-subject requests. `EXPORT` produces an archive of the
 * caller's data; `ERASURE` is the right-to-be-forgotten path. Handled by an
 * administrator against a statutory deadline (`DataRequest.dueAt`).
 */
exports.DATA_REQUEST_TYPES = ['EXPORT', 'ERASURE'];
exports.DATA_REQUEST_STATUSES = [
    'REQUESTED',
    'IN_PROGRESS',
    'COMPLETED',
    'REJECTED',
];
/**
 * Section 42 notification events. Kept as constants rather than a union so the
 * admin notification composer (section 31) can enumerate them at runtime.
 */
exports.NOTIFICATION_EVENTS = {
    OTP_REQUESTED: 'OTP_REQUESTED',
    PROFILE_APPROVED: 'PROFILE_APPROVED',
    PROFILE_REJECTED: 'PROFILE_REJECTED',
    PAYMENT_SUCCESSFUL: 'PAYMENT_SUCCESSFUL',
    /**
     * C3: the client asked for a reminder 2 hours before an unlock expires.
     * `UNLOCK_EXPIRING_SOON` is retained because section 42 already listed a
     * generic "unlock approaching expiry" event, but the scheduler must key off
     * the explicit one so the lead time is a documented 2 hours rather than
     * whatever the job happened to use.
     */
    UNLOCK_EXPIRING_IN_2H: 'UNLOCK_EXPIRING_IN_2H',
    UNLOCK_EXPIRED: 'UNLOCK_EXPIRED',
    ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
    REPORT_ACTION_TAKEN: 'REPORT_ACTION_TAKEN',
    SYSTEM_ANNOUNCEMENT: 'SYSTEM_ANNOUNCEMENT',
    // -- added by client answer D9 --
    IDENTITY_VERIFIED: 'IDENTITY_VERIFIED',
    IDENTITY_VERIFICATION_FAILED: 'IDENTITY_VERIFICATION_FAILED',
    SETUP_FEE_PAID: 'SETUP_FEE_PAID',
    SETUP_FEE_REQUIRED: 'SETUP_FEE_REQUIRED',
};
/** C3: lead time for the pre-expiry reminder, in hours. */
exports.UNLOCK_EXPIRY_REMINDER_HOURS = 2;
/** Section 24 default admin widgets. */
exports.ADMIN_DASHBOARD_WIDGETS = [
    'totalUsers',
    'newRegistrations',
    'pendingApprovals',
    'approvedProfiles',
    'rejectedProfiles',
    'suspendedProfiles',
    'deletedProfiles',
    'pendingIdentityVerifications',
    'setupFeesCollectedToday',
    'paymentsToday',
    'paymentsThisMonth',
    'totalPaymentValue',
    'activeUnlocks',
    'expiredUnlocks',
    'pendingReports',
    'openDataRequests',
];
/**
 * Section 33 role catalogue. Roles are a fixed set; what changes is the
 * permissions each holds. Guards check permissions, never these slugs, so a role
 * can be re-scoped in the database without a deploy.
 */
exports.ADMIN_ROLE_SLUGS = [
    'SUPER_ADMIN',
    'ADMIN',
    'MODERATION_ADMIN',
    'FINANCE_ADMIN',
];
//# sourceMappingURL=enums.js.map