import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import {
  InitiateVerificationSchema,
  type AccessTokenClaims,
  type InitiateVerificationRequest,
  type VerificationStatusResponse,
  type VerificationWebhook,
} from '@matrimony/shared';
import { VerificationService } from './verification.service';

@Controller('verification')
@UseGuards(JwtAuthGuard)
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Post('initiate')
  async initiate(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(InitiateVerificationSchema)) body: InitiateVerificationRequest,
  ): Promise<VerificationStatusResponse> {
    return this.verification.initiateVerification(claims.sub, body);
  }

  @Get('status')
  async status(
    @AuthUser() claims: AccessTokenClaims,
  ): Promise<VerificationStatusResponse> {
    return this.verification.getVerificationStatus(claims.sub);
  }

  @Post('webhook')
  async webhook(
    @Body() body: VerificationWebhook,
  ): Promise<void> {
    await this.verification.handleWebhook(body);
  }
}
