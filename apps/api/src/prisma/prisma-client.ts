/**
 * Single import surface for the generated Prisma client.
 *
 * The generated files live under `src/generated/prisma` and are gitignored
 * (regenerate with `npm run prisma:generate`). Keeping every reference to that
 * path in this one file means moving the generator output later is a
 * single-line change rather than a repo-wide find-and-replace.
 */

export { PrismaClient } from '../generated/prisma/client';
export { Prisma } from '../generated/prisma/client';

export {
  AdminRoleSlug,
  ConsentStatus,
  ConsentType,
  DataRequestStatus,
  DataRequestType,
  Gender,
  GenderPreference,
  IdentityVerificationProvider,
  IdentityVerificationStatus,
  MaritalStatus,
  NotificationChannel,
  NotificationStatus,
  OtpPurpose,
  OtpStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  PhotoStatus,
  PhotoType,
  ProfileStatus,
  ProfileVisibility,
  ReportActionType,
  ReportReasonCode,
  ReportStatus,
  UnlockStatus,
  UserStatus,
} from '../generated/prisma/enums';

export type {
  AdminGrantAudit,
  AdminRole,
  AdminRoleAssignment,
  AdminUser,
  AuditLog,
  BlockedUser,
  ConsentRecord,
  ContactUnlock,
  DataRequest,
  IdentityVerification,
  MasterList,
  MasterListValue,
  Notification,
  OtpRequest,
  PartnerPreference,
  Payment,
  Permission,
  PricingConfig,
  Profile,
  ProfileAttribute,
  ProfilePhoto,
  RefreshToken,
  Report,
  ReportReason,
  User,
  WebhookEvent,
} from '../generated/prisma/client';
