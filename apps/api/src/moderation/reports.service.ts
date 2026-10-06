import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateReportRequest,
  ReportReasonListResponse,
  ReportReason as ReportReasonContract,
  ReportSummary,
} from '@matrimony/shared';
import { PrismaClient, ReportStatus } from '../prisma/prisma-client';
import { isLiveProfile } from './profile-visibility';

/**
 * Section 20 — file a report, and serve the reason list the report form is
 * built from.
 *
 * Two things are deliberately absent. There is no read path for a user's own
 * reports: section 20 describes a one-way pipe into the admin dashboard, and a
 * status the reporter could poll would tell them when moderation has looked at
 * the account they complained about, which is exactly the information a
 * retaliatory party wants. And there is no way to withdraw one — an inbox that
 * can be emptied by the accused is not an inbox.
 *
 * The reason list is admin-configurable, so the client is never trusted to
 * supply a reason string. It sends a `reason_id` it was served, and the server
 * resolves the code. A reason retired since the form was rendered answers 404
 * rather than being filed under a code that no longer appears on the dashboard's
 * filter list.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Active reasons in the order the app should render them. */
  async reasons(): Promise<ReportReasonListResponse> {
    const rows = await this.prisma.reportReason.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        code: true,
        label: true,
        description: true,
        requiresDescription: true,
      },
    });

    return {
      items: rows.map(
        (row): ReportReasonContract => ({
          reason_id: row.id,
          code: row.code,
          label: row.label,
          description: row.description,
          requires_description: row.requiresDescription,
        }),
      ),
    };
  }

  /**
   * Files a report, or returns the one already open for the same complaint.
   *
   * Repeating a submission is not an error. A client retrying after a dropped
   * connection has to reach the same state as one that got through, and the
   * moderation queue is itself a spam surface: nothing stops a determined user
   * from tapping submit fifty times, so an identical still-open report is
   * collapsed rather than appended. A *resolved* one is not — a report the
   * admin dismissed is a complaint that was considered, and filing it again
   * after the conduct continued is a new incident, not a duplicate.
   */
  async create(reporterId: string, body: CreateReportRequest): Promise<ReportSummary> {
    const reason = await this.prisma.reportReason.findUnique({
      where: { id: body.reason_id },
      select: { id: true, code: true, isActive: true, requiresDescription: true },
    });

    if (!reason || !reason.isActive) {
      throw new NotFoundException('Report reason not found');
    }

    // Trimmed again here rather than trusting the contract to have done it.
    // zod does trim, but this is the check that decides whether the report is
    // accepted, and a requirement that only holds when a pipe runs in front of
    // it is a requirement that stops holding the day a second caller appears.
    const description = body.description?.trim() || null;

    if (reason.requiresDescription && !description) {
      throw new BadRequestException('A description is required for this reason');
    }

    const profile = await this.prisma.profile.findUnique({
      where: { id: body.profile_id },
      select: {
        id: true,
        userId: true,
        deletedAt: true,
        user: {
          select: {
            networthCategory: true,
            deletedAt: true,
            isAnonymised: true,
            status: true,
          },
        },
      },
    });

    // A deleted or purged profile answers exactly like one that never existed.
    // Section 21 requires that a deleted profile stop being reachable, and a
    // report that still filed would be a way to confirm the id was once real.
    if (!isLiveProfile(profile)) {
      throw new NotFoundException('Profile not found');
    }

    // Section 12: profile ids must not allow cross-category access. Reporting
    // returns no photograph, but a 201 against an id from the other band still
    // confirms the id exists there, which is what the band rule exists to stop.
    // Read from the database rather than from `claims.cat` because an admin may
    // have moved this user since the token was signed.
    const reporter = await this.prisma.user.findUniqueOrThrow({
      where: { id: reporterId },
      select: { networthCategory: true },
    });

    if (reporter.networthCategory !== profile.user.networthCategory) {
      throw new NotFoundException('Profile not found');
    }

    if (profile.userId === reporterId) {
      throw new BadRequestException('You cannot report your own profile');
    }

    const existing = await this.prisma.report.findFirst({
      where: {
        reporterId,
        reportedProfileId: profile.id,
        reasonId: reason.id,
        status: ReportStatus.OPEN,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, createdAt: true },
    });

    if (existing) {
      return this.summary(existing.id, profile.id, reason.code, existing.status, existing.createdAt);
    }

    const row = await this.prisma.report.create({
      data: {
        reporterId,
        // Both pointers, not one. The profile link is what the dashboard groups
        // by, but it is nullable and set null on profile deletion — the user
        // link is what keeps a complaint about a since-removed profile attached
        // to the account that filed it.
        reportedProfileId: profile.id,
        reportedUserId: profile.userId,
        reasonId: reason.id,
        description,
      },
      select: { id: true, status: true, createdAt: true },
    });

    return this.summary(row.id, profile.id, reason.code, row.status, row.createdAt);
  }

  private summary(
    reportId: string,
    profileId: string,
    reasonCode: ReportSummary['reason_code'],
    status: ReportStatus,
    createdAt: Date,
  ): ReportSummary {
    return {
      report_id: reportId,
      profile_id: profileId,
      reason_code: reasonCode,
      status,
      created_at: createdAt.toISOString(),
    };
  }
}
