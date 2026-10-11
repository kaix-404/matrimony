/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, ConsentType, ConsentStatus } from '../prisma/prisma-client';
import type {
  IdentityVerificationProvider,
  IdentityVerificationStatus,
  InitiateVerificationRequest,
  VerificationStatusResponse,
  VerificationWebhook,
} from '@matrimony/shared';

@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaClient) {}

  async initiateVerification(userId: string, body: InitiateVerificationRequest): Promise<VerificationStatusResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { identityChecks: true } });
    if (!user) throw new NotFoundException('User not found');
    const now = new Date();
    const consent = await this.prisma.consentRecord.create({
      data: {
        userId,
        type: ConsentType.AADHAAR_PROCESSING,
        status: ConsentStatus.GRANTED,
        policyVersion: (body as any).policyVersion ?? 'v1',
        grantedAt: now,
        ipHash: (body as any).metadata?.ipHash ?? null,
        deviceId: (body as any).metadata?.deviceId ?? null,
      },
    });
    const identity = await this.prisma.identityVerification.upsert({
      where: { userId },
      create: {
        userId,
        provider: body.provider as any,
        vendor: 'CASHFREE' as any,
        status: 'PENDING' as any,
        providerReference: (body as any).providerReference ?? null,
        aadhaarLast4: (body as any).aadhaarLast4 ?? null,
        nameOnId: (body as any).nameOnId ?? null,
        yearOfBirth: (body as any).yearOfBirth ?? null,
        consentRecordId: consent.id,
      },
      update: {
        provider: body.provider as any,
        vendor: 'CASHFREE' as any,
        status: 'PENDING' as any,
        providerReference: (body as any).providerReference ?? null,
        aadhaarLast4: (body as any).aadhaarLast4 ?? null,
        nameOnId: (body as any).nameOnId ?? null,
        yearOfBirth: (body as any).yearOfBirth ?? null,
        consentRecordId: consent.id,
        verifiedAt: null,
        failureReason: null,
        failureCode: null,
        providerReferenceExpiresAt: null,
        updatedAt: now,
      },
    });
    return this.toResponse(identity);
  }

  async getVerificationStatus(userId: string): Promise<VerificationStatusResponse> {
    const identity = await this.prisma.identityVerification.findUnique({ where: { userId } });
    if (!identity) throw new NotFoundException('Identity verification not found');
    return this.toResponse(identity);
  }

  async handleWebhook(body: VerificationWebhook): Promise<void> {
    const data = (body as any)?.data ?? (body as any);
    const providerReference = data.providerReference;
    if (!providerReference) return;
    const identity = await this.prisma.identityVerification.findFirst({ where: { providerReference } });
    if (!identity) return;
    const now = new Date();
    let status: any = identity.status;
    let verifiedAt: Date | null = identity.verifiedAt;
    let failureReason: string | null = identity.failureReason;
    let failureCode: string | null = identity.failureCode;
    if (data.status === 'SUCCESS' || data.result === 'SUCCESS' || (body as any).event?.includes('success')) {
      status = 'VERIFIED';
      verifiedAt = now;
      failureReason = null;
      failureCode = null;
    } else if (data.status === 'FAILED' || data.result === 'FAILED' || (body as any).event?.includes('fail')) {
      status = 'FAILED';
      verifiedAt = null;
      failureReason = data.failureReason ?? null;
      failureCode = data.failureCode ?? null;
    }
    await this.prisma.identityVerification.update({ where: { id: identity.id }, data: { status, verifiedAt, failureReason, failureCode, updatedAt: now } });
  }

  private toResponse(identity: any): VerificationStatusResponse {
    return {
      status: identity.status as IdentityVerificationStatus,
      provider: identity.provider as IdentityVerificationProvider,
      vendor: identity.vendor as any,
      aadhaarLast4: identity.aadhaarLast4,
      nameOnId: identity.nameOnId,
      yearOfBirth: identity.yearOfBirth,
      failureCode: identity.failureCode,
      failureReason: identity.failureReason,
      verifiedAt: identity.verifiedAt?.toISOString() ?? null,
      providerReferenceExpiresAt: identity.providerReferenceExpiresAt?.toISOString() ?? null,
    } as VerificationStatusResponse;
  }
}
