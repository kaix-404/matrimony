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
/**
 * Seeded band keys. These are the four the client confirmed, kept only as
 * documentation and as the expected starting point asserted by the seed.
 * Runtime code must not branch on these — read the table.
 */
export declare const SEEDED_NET_WORTH_CATEGORY_KEYS: readonly ["BELOW_2CR", "TWO_CR_TO_FIVE_CR", "FIVE_CR_TO_TEN_CR", "ABOVE_10CR", "PENDING_REVIEW"];
export type SeededNetWorthCategoryKey = (typeof SEEDED_NET_WORTH_CATEGORY_KEYS)[number];
/**
 * The fallback bucket for a value that falls in no band and needs admin review.
 *
 * GAP-2 (closed 2026-10-23, client answer 5) confirmed that a value exactly on a
 * boundary goes *up* into the higher band, so this bucket is not what a boundary
 * value lands in; it is the fail-closed home for anything a band cannot place.
 */
export declare const NET_WORTH_PENDING_REVIEW_KEY = "PENDING_REVIEW";
/**
 * Shape of a category row as delivered by the API, in the internal camelCase
 * shape used by services.
 *
 * The wire format is `NetWorthCategoryOptionSchema` in contracts/discovery.ts,
 * which is snake_case to match every other contract and carries the GST-inclusive
 * `setupFeeTotal`. This interface is the domain-side view of the same row; the
 * service converts. Kept distinct from the wire type so the two cannot drift
 * into one ambiguous export.
 */
export interface NetWorthCategoryRefRow {
    key: string;
    label: string;
    description: string;
    /** Inclusive lower bound in whole rupees; null = no lower bound. */
    minInr: string | null;
    /** Exclusive upper bound in whole rupees; null = no upper bound. */
    maxInr: string | null;
    /** The one-time account setup fee base (D9), as a decimal string. */
    setupFeeAmount: string;
    isDiscoverable: boolean;
    sortOrder: number;
}
export declare const PROFILE_STATUSES: readonly ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "SUSPENDED", "DELETED"];
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];
export declare const PROFILE_VISIBILITIES: readonly ["ACTIVE", "PAUSED", "HIDDEN"];
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];
export declare const PHOTO_STATUSES: readonly ["PENDING_REVIEW", "APPROVED", "REJECTED"];
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];
/** D1: single-person and family group photos are both accepted, and a family
 * photo may contain several faces — so screening cannot assume one face per
 * image. The app states which it is uploading rather than letting moderation
 * guess. */
export declare const PHOTO_TYPES: readonly ["SINGLE", "FAMILY"];
export type PhotoType = (typeof PHOTO_TYPES)[number];
export declare const PAYMENT_STATUSES: readonly ["CREATED", "PENDING", "SUCCESS", "FAILED", "CANCELLED", "REFUND_PENDING", "REFUNDED", "PARTIALLY_REFUNDED"];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
/** Section 40: only these states authorise the creation of a ContactUnlock. */
export declare const SETTLED_PAYMENT_STATUSES: readonly PaymentStatus[];
export declare const UNLOCK_STATUSES: readonly ["ACTIVE", "EXPIRED", "REVOKED"];
export type UnlockStatus = (typeof UNLOCK_STATUSES)[number];
export declare const GENDERS: readonly ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"];
export type Gender = (typeof GENDERS)[number];
export declare const GENDER_PREFERENCES: readonly ["MALE", "FEMALE", "ANY"];
export type GenderPreference = (typeof GENDER_PREFERENCES)[number];
export declare const MARITAL_STATUSES: readonly ["NEVER_MARRIED", "DIVORCED", "WIDOWED", "AWAITING_DIVORCE", "ANNULLED"];
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];
/** Section 20 defaults. Admin-managed via the ReportReason table. */
export declare const DEFAULT_REPORT_REASON_CODES: readonly ["FAKE_PROFILE", "INCORRECT_INFORMATION", "INAPPROPRIATE_CONTENT", "INCORRECT_CONTACT", "HARASSMENT", "OTHER"];
export type ReportReasonCode = (typeof DEFAULT_REPORT_REASON_CODES)[number];
/**
 * Section 30 report lifecycle. `OPEN` is intake, `IN_REVIEW` is an administrator
 * having picked it up, and `DISMISSED`/`ACTIONED` are the two terminal states a
 * moderation decision lands on.
 */
export declare const REPORT_STATUSES: readonly ["OPEN", "IN_REVIEW", "DISMISSED", "ACTIONED"];
export type ReportStatus = (typeof REPORT_STATUSES)[number];
/**
 * Section 30 moderation actions. Only `SUSPEND` currently carries an automatic
 * side effect (the reported account is suspended); the rest are recorded on the
 * report for the audit trail.
 */
export declare const REPORT_ACTION_TYPES: readonly ["DISMISS", "WARN", "SUSPEND", "BLOCK", "DELETE"];
export type ReportActionType = (typeof REPORT_ACTION_TYPES)[number];
export declare const NOTIFICATION_CHANNELS: readonly ["PUSH", "SMS", "EMAIL", "IN_APP"];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
/**
 * Section 42 push delivery (client decision 2026-10-01: Firebase). The platform
 * a device belongs to, recorded so a send can be scoped or metered per store and
 * so an iOS-only or Android-only credential change is visible. `WEB` is included
 * because FCM serves web push too, even though the first client is mobile.
 */
export declare const DEVICE_PLATFORMS: readonly ["ANDROID", "IOS", "WEB"];
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];
/**
 * Section 21/32 data-subject requests. `EXPORT` produces an archive of the
 * caller's data; `ERASURE` is the right-to-be-forgotten path. Handled by an
 * administrator against a statutory deadline (`DataRequest.dueAt`).
 */
export declare const DATA_REQUEST_TYPES: readonly ["EXPORT", "ERASURE"];
export type DataRequestType = (typeof DATA_REQUEST_TYPES)[number];
export declare const DATA_REQUEST_STATUSES: readonly ["REQUESTED", "IN_PROGRESS", "COMPLETED", "REJECTED"];
export type DataRequestStatus = (typeof DATA_REQUEST_STATUSES)[number];
/**
 * Section 42 notification events. Kept as constants rather than a union so the
 * admin notification composer (section 31) can enumerate them at runtime.
 */
export declare const NOTIFICATION_EVENTS: {
    readonly OTP_REQUESTED: "OTP_REQUESTED";
    readonly PROFILE_APPROVED: "PROFILE_APPROVED";
    readonly PROFILE_REJECTED: "PROFILE_REJECTED";
    readonly PAYMENT_SUCCESSFUL: "PAYMENT_SUCCESSFUL";
    /**
     * C3: the client asked for a reminder 2 hours before an unlock expires.
     * `UNLOCK_EXPIRING_SOON` is retained because section 42 already listed a
     * generic "unlock approaching expiry" event, but the scheduler must key off
     * the explicit one so the lead time is a documented 2 hours rather than
     * whatever the job happened to use.
     */
    readonly UNLOCK_EXPIRING_IN_2H: "UNLOCK_EXPIRING_IN_2H";
    readonly UNLOCK_EXPIRED: "UNLOCK_EXPIRED";
    readonly ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED";
    readonly REPORT_ACTION_TAKEN: "REPORT_ACTION_TAKEN";
    readonly SYSTEM_ANNOUNCEMENT: "SYSTEM_ANNOUNCEMENT";
    readonly IDENTITY_VERIFIED: "IDENTITY_VERIFIED";
    readonly IDENTITY_VERIFICATION_FAILED: "IDENTITY_VERIFICATION_FAILED";
    readonly SETUP_FEE_PAID: "SETUP_FEE_PAID";
    readonly SETUP_FEE_REQUIRED: "SETUP_FEE_REQUIRED";
};
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS];
/** C3: lead time for the pre-expiry reminder, in hours. */
export declare const UNLOCK_EXPIRY_REMINDER_HOURS = 2;
/** Section 24 default admin widgets. */
export declare const ADMIN_DASHBOARD_WIDGETS: readonly ["totalUsers", "newRegistrations", "pendingApprovals", "approvedProfiles", "rejectedProfiles", "suspendedProfiles", "deletedProfiles", "pendingIdentityVerifications", "setupFeesCollectedToday", "paymentsToday", "paymentsThisMonth", "totalPaymentValue", "activeUnlocks", "expiredUnlocks", "pendingReports", "openDataRequests"];
export type AdminDashboardWidget = (typeof ADMIN_DASHBOARD_WIDGETS)[number];
/**
 * Section 33 role catalogue. Roles are a fixed set; what changes is the
 * permissions each holds. Guards check permissions, never these slugs, so a role
 * can be re-scoped in the database without a deploy.
 */
export declare const ADMIN_ROLE_SLUGS: readonly ["SUPER_ADMIN", "ADMIN", "MODERATION_ADMIN", "FINANCE_ADMIN"];
export type AdminRoleSlug = (typeof ADMIN_ROLE_SLUGS)[number];
//# sourceMappingURL=enums.d.ts.map