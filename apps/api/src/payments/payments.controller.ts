import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import {
  CreateUnlockOrderSchema,
  type AccessTokenClaims,
  type CreateUnlockOrderRequest,
  type PaymentOrderResponse,
  type PaymentStatusResponse,
  type PaymentWebhookAck,
} from '@matrimony/shared';
import { PaymentsService } from './payments.service';

/**
 * Payments (spec sections 14, 27 and 40).
 *
 * Two surfaces with very different trust levels:
 *
 *   * The order and status endpoints are authenticated and scoped to the caller.
 *     They can only *ask* for a payment; none of them can declare one succeeded.
 *   * The webhook is unauthenticated — the gateway has no user session — and is
 *     authenticated instead by an HMAC over its raw body. It is the only writer
 *     of `ContactUnlock`.
 */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('unlocks')
  @UseGuards(JwtAuthGuard)
  async createUnlockOrder(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(CreateUnlockOrderSchema)) body: CreateUnlockOrderRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentOrderResponse> {
    return this.payments.createUnlockOrder(
      claims.sub,
      body.profile_id,
      normalizeKey(idempotencyKey),
    );
  }

  @Post('setup-fee')
  @UseGuards(JwtAuthGuard)
  async createSetupFeeOrder(
    @AuthUser() claims: AccessTokenClaims,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PaymentOrderResponse> {
    return this.payments.createSetupFeeOrder(claims.sub, normalizeKey(idempotencyKey));
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async status(
    @AuthUser() claims: AccessTokenClaims,
    @Param('id') paymentId: string,
  ): Promise<PaymentStatusResponse> {
    return this.payments.getStatus(claims.sub, paymentId);
  }

  /**
   * Gateway callback.
   *
   * Not guarded by JWT, deliberately: the caller has no session. Its authority
   * comes from `verifyWebhookSignature` over `req.rawBody`, which is the exact
   * byte string Razorpay signed. Parsing to JSON first and re-serialising would
   * change key order and whitespace and break verification for reasons that
   * have nothing to do with tampering, so `main.ts` enables Nest's `rawBody`
   * capture and this handler reads that instead.
   *
   * `@HttpCode(200)`: a POST that returns 201 makes some gateways treat the
   * acknowledgement as a resource creation and retry it.
   */
  @Post('webhook')
  @HttpCode(200)
  // Raised above the global limit: Razorpay retries on any non-2xx and on
  // latency, so a throttled capture would be a stuck payment rather than an
  // attacker's wish. Still bounded, because this route is unauthenticated.
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async webhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature?: string,
  ): Promise<PaymentWebhookAck> {
    const rawBody = request.rawBody?.toString('utf8') ?? '';
    return this.payments.handleWebhook(rawBody, signature);
  }
}

/**
 * An idempotency key is optional, but a malformed one is not silently ignored:
 * accepting an empty or unbounded string would let two requests share a key by
 * accident, which is the one failure mode replay protection exists to prevent.
 */
function normalizeKey(raw?: string): string | undefined {
  if (raw === undefined) return undefined;
  const key = raw.trim();
  if (key === '') return undefined;
  if (key.length > 255) {
    throw new BadRequestException('Idempotency-Key must be at most 255 characters');
  }
  return key;
}
