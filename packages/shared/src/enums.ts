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
export const SEEDED_NET_WORTH_CATEGORY_KEYS = [
  'BELOW_2CR',
  'TWO_CR_TO_FIVE_CR',
  'FIVE_CR_TO_TEN_CR',
  'ABOVE_10CR',
  'PENDING_REVIEW',
] as const;
export type SeededNetWorthCategoryKey = (typeof SEEDED_NET_WORTH_CATEGORY_KEYS)[number];

/** The bucket for a value landing exactly on a band boundary, pending admin review. */
export const NET_WORTH_PENDING_REVIEW_KEY = 'PENDING_REVIEW';

/**
 * Shape of a category row as delivered by the API. Numeric bounds are strings
 * because they are rupee amounts, and JavaScript numbers are not safe above
 * 2^53 paise.
 */
export interface NetWorthCategoryOption {
  key: string;
  label: string;
  description: string;
  /** Inclusive lower bound in whole rupees; null = no lower bound. */
  minInr: string | null;
  /** Exclusive upper bound in whole rupees; null = no upper bound. */
  maxInr: string | null;
  /** The one-time account setup fee (D9), as a decimal string. */
  setupFeeAmount: string;
  isDiscoverable: boolean;
  sortOrder: number;
}

export const PROFILE_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
  'DELETED',
] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const PROFILE_VISIBILITIES = ['ACTIVE', 'PAUSED', 'HIDDEN'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

export const PHOTO_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

/** D1: single-person and family group photos are both accepted, and a family
 * photo may contain several faces — so screening cannot assume one face per
 * image. The app states which it is uploading rather than letting moderation
 * guess. */
export const PHOTO_TYPES = ['SINGLE', 'FAMILY'] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

export const PAYMENT_STATUSES = [
  'CREATED',
  'PENDING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Section 40: only these states authorise the creation of a ContactUnlock. */
export const SETTLED_PAYMENT_STATUSES: readonly PaymentStatus[] = ['SUCCESS'];

export const UNLOCK_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type UnlockStatus = (typeof UNLOCK_STATUSES)[number];

export const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_PREFERENCES = ['MALE', 'FEMALE', 'ANY'] as const;
export type GenderPreference = (typeof GENDER_PREFERENCES)[number];

export const MARITAL_STATUSES = [
  'NEVER_MARRIED',
  'DIVORCED',
  'WIDOWED',
  'AWAITING_DIVORCE',
  'ANNULLED',
] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

/** Section 20 defaults. Admin-managed via the ReportReason table. */
export const DEFAULT_REPORT_REASON_CODES = [
  'FAKE_PROFILE',
  'INCORRECT_INFORMATION',
  'INAPPROPRIATE_CONTENT',
  'INCORRECT_CONTACT',
  'HARASSMENT',
  'OTHER',
] as const;
export type ReportReasonCode = (typeof DEFAULT_REPORT_REASON_CODES)[number];

export const NOTIFICATION_CHANNELS = ['PUSH', 'SMS', 'EMAIL', 'IN_APP'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Section 42 notification events. Kept as constants rather than a union so the
 * admin notification composer (section 31) can enumerate them at runtime.
 */
export const NOTIFICATION_EVENTS = {
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
} as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS];

/** C3: lead time for the pre-expiry reminder, in hours. */
export const UNLOCK_EXPIRY_REMINDER_HOURS = 2;

/** Section 24 default admin widgets. */
export const ADMIN_DASHBOARD_WIDGETS = [
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
] as const;
export type AdminDashboardWidget = (typeof ADMIN_DASHBOARD_WIDGETS)[number];
