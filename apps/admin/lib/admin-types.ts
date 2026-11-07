import type {
  AdminDataRequestView,
  AdminReportView,
  AdminUserView,
  AdminVerificationView,
} from '@matrimony/shared';

/**
 * Collection metadata. The admin list endpoints return it in camelCase (the
 * API's own convention for envelope fields) even though individual views such
 * as `AdminReportView` are snake_case, so the two are declared separately
 * rather than assumed to match.
 */
export interface PageMeta {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AdminReportList extends PageMeta {
  reports: AdminReportView[];
}

/**
 * A member account as the admin user list shows it (ids and status, no profile).
 *
 * `email` is nullable: registration is by mobile number, and an email address is
 * an optional detail a member may never have given.
 */
export interface AdminUserSummary {
  id: string;
  email: string | null;
  mobile: string;
  status: string;
  createdAt: string;
}

export interface AdminUserList extends PageMeta {
  users: AdminUserSummary[];
}

export interface AdminAdminList extends PageMeta {
  admins: AdminUserView[];
}

export interface AdminVerificationList extends PageMeta {
  verifications: AdminVerificationView[];
}

export interface AdminDataRequestList extends PageMeta {
  requests: AdminDataRequestView[];
}
