import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  CreateDataRequestSchema,
  type AccessTokenClaims,
  type CreateDataRequestInput,
  type DataRequest,
  type DataRequestListResponse,
} from '@matrimony/shared';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { DataRequestsService } from './data-requests.service';

/**
 * Section 21 — a member's own data requests.
 *
 * Both routes are scoped by the token subject. There is no `/data-requests/:id`
 * and no `userId` parameter: the member is the subject of everything they can
 * reach here, and an id in the path would only be a way to ask whether another
 * account had filed one.
 */
@Controller('data-requests')
@UseGuards(JwtAuthGuard)
export class DataRequestsController {
  constructor(private readonly dataRequests: DataRequestsService) {}

  /**
   * Files an export request.
   *
   * 201 whether a row was created or one was already waiting — the member sees
   * the same "we are preparing this" state either way, so a retry after a dropped
   * connection must not be reported as a failure.
   */
  @Post()
  create(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(CreateDataRequestSchema)) body: CreateDataRequestInput,
  ): Promise<DataRequest> {
    return this.dataRequests.create(claims.sub, body);
  }

  @Get()
  list(@AuthUser() claims: AccessTokenClaims): Promise<DataRequestListResponse> {
    return this.dataRequests.list(claims.sub);
  }
}
