import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { bareContentType, readUploadBody } from '../common/http/raw-body';
import { ZodValidationPipe, toFieldIssues } from '../common/validation/zod-validation.pipe';
import {
  UploadObjectQuerySchema,
  type UploadObjectQuery,
} from '../common/validation/upload-object-query';
import {
  InitiateManualDocumentUploadSchema,
  InitiateVerificationSchema,
  MAX_MANUAL_DOCUMENT_BYTES,
  SubmitManualDocumentSchema,
  VerificationWebhookSchema,
  type AccessTokenClaims,
  type InitiateManualDocumentUploadInput,
  type InitiateVerificationRequest,
  type ManualDocumentTicket,
  type SubmitManualDocumentInput,
  type VerificationStatusResponse,
} from '@matrimony/shared';
import { VerificationService } from './verification.service';
import { VerificationGateway } from './verification.gateway';

/**
 * Identity verification (D9).
 *
 * Two surfaces with different trust levels, like payments:
 *
 *   * `initiate` and `status` are authenticated and scoped to the caller. They
 *     can start an attempt and read its outcome, but neither can declare one
 *     successful — that is only ever the signed webhook.
 *   * `webhook` is not guarded by JWT, deliberately: Cashfree has no user
 *     session. Its authority is the HMAC over the raw body, checked here before
 *     anything is parsed. The guard used to sit on the controller, which made
 *     the webhook unroutable for its actual caller while requiring the two user
 *     routes to keep theirs — so it is attached per route now.
 */
@Controller('verification')
export class VerificationController {
  constructor(
    private readonly verification: VerificationService,
    private readonly gateway: VerificationGateway,
  ) {}

  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  async initiate(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(InitiateVerificationSchema)) body: InitiateVerificationRequest,
  ): Promise<VerificationStatusResponse> {
    return this.verification.initiateVerification(claims.sub, body);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async status(@AuthUser() claims: AccessTokenClaims): Promise<VerificationStatusResponse> {
    return this.verification.getVerificationStatus(claims.sub);
  }

  // -- manual document review (the D9 fallback) -----------------------------

  /**
   * Reserves an upload for a document check.
   *
   * The fallback exists because the DigiLocker supplier can be unreachable for
   * reasons that have nothing to do with a member, and KYC gates discovery for
   * the whole product. Same three-step handshake as photos: reserve, send bytes,
   * submit the key — so the app learns one upload pattern.
   */
  @Post('manual/upload')
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  async initiateManualUpload(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(InitiateManualDocumentUploadSchema))
    body: InitiateManualDocumentUploadInput,
  ): Promise<ManualDocumentTicket> {
    return this.verification.initiateManualUpload(claims.sub, body);
  }

  /**
   * Receives the document bytes on the website's behalf.
   *
   * A browser cannot PUT to the bucket (cross-origin, and the bucket's CORS rule
   * is not something this deployment can write), so the bytes come here and are
   * written under the caller's own `verification/` prefix.
   */
  @Put('manual/content')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async uploadManualContent(
    @AuthUser() claims: AccessTokenClaims,
    @Query(new ZodValidationPipe(UploadObjectQuerySchema)) query: UploadObjectQuery,
    @Headers('content-type') contentType: string | undefined,
    @Req() req: Request,
  ): Promise<void> {
    const body = await readUploadBody(req, MAX_MANUAL_DOCUMENT_BYTES);
    await this.verification.uploadManualBytes(
      claims.sub,
      query.object_key,
      body,
      bareContentType(contentType),
    );
  }

  /**
   * Puts the uploaded document into the review queue.
   *
   * Nothing is verified here: the row goes to PENDING and an administrator's
   * decision is what moves it, exactly as the supplier's signed webhook is what
   * moves a DigiLocker row.
   */
  @Post('manual/submit')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async submitManualDocument(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(SubmitManualDocumentSchema)) body: SubmitManualDocumentInput,
  ): Promise<VerificationStatusResponse> {
    return this.verification.submitManualDocument(claims.sub, body);
  }

  /**
   * DigiLocker callback.
   *
   * `req.rawBody` is the exact byte string Cashfree signed; parsing to JSON and
   * re-serialising would change key order and spacing and break verification
   * for reasons that have nothing to do with tampering, so the signature is
   * checked against the raw bytes and the parsed body is used only afterwards.
   *
   * `@HttpCode(200)`: the vendor retries on a non-2xx, and an
   * acknowledgement is not a resource creation.
   */
  @Post('webhook')
  @HttpCode(200)
  // Raised above the global limit for the same reason as the payment webhook:
  // a throttled callback is a stuck verification, not an attacker's wish. Still
  // bounded, because this route is unauthenticated.
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async webhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-webhook-timestamp') timestamp?: string,
  ): Promise<void> {
    const rawBody = request.rawBody?.toString('utf8') ?? '';

    if (!this.gateway.verifyWebhookSignature(rawBody, signature, timestamp)) {
      // One message for a missing signature, a missing timestamp and a wrong
      // digest: telling a caller which part of the credential failed is free
      // help for someone probing the endpoint.
      throw new UnauthorizedException('Invalid webhook signature');
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Webhook body is not valid JSON');
    }

    const parsed = VerificationWebhookSchema.safeParse(json);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Request validation failed',
        errors: toFieldIssues(parsed.error.issues),
      });
    }

    await this.verification.handleWebhook(parsed.data);
  }
}
