import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  CreateReportSchema,
  type AccessTokenClaims,
  type CreateReportRequest,
  type ReportReasonListResponse,
  type ReportSummary,
} from '@matrimony/shared';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { ReportsService } from './reports.service';

/**
 * Section 20 — the report pipeline's intake.
 *
 * `reasons` sits under this controller rather than its own because the reason
 * list exists only to be handed to the form that posts to `create`; a separate
 * resource would invite a read endpoint nobody asked for.
 *
 * Both routes are authenticated. The reason list is not sensitive, but serving
 * it anonymously would make this the one unauthenticated route in the app and
 * hand rate-limit budget to anyone who wanted it.
 */
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('reasons')
  reasons(): Promise<ReportReasonListResponse> {
    return this.reports.reasons();
  }

  /**
   * 201 whether or not the complaint was already open.
   *
   * The reporter cannot observe the difference, so the status code cannot
   * either: answering 200 on a repeat would tell a client its first submission
   * did not land, and it would send it back to submit again.
   */
  @Post()
  create(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(CreateReportSchema)) body: CreateReportRequest,
  ): Promise<ReportSummary> {
    return this.reports.create(claims.sub, body);
  }
}
