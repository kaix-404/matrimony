/**
 * Identity verification contracts — Phase 6 (KYC).
 */
import { z } from 'zod';

export const IdentityVerificationProviderSchema = z.enum(['DIGILOCKER', 'AADHAAR_UIDAI']);
export type IdentityVerificationProvider = z.infer<typeof IdentityVerificationProviderSchema>;

export const IdentityVerificationVendorSchema = z.enum(['CASHFREE']);
export type IdentityVerificationVendor = z.infer<typeof IdentityVerificationVendorSchema>;

export const IdentityVerificationStatusSchema = z.enum(['PENDING', 'VERIFIED', 'FAILED', 'EXPIRED']);
export type IdentityVerificationStatus = z.infer<typeof IdentityVerificationStatusSchema>;

export const InitiateVerificationSchema = z.object({
  provider: IdentityVerificationProviderSchema,
});

export type InitiateVerificationRequest = z.infer<typeof InitiateVerificationSchema>;

export const VerificationStatusResponseSchema = z.object({
  status: IdentityVerificationStatusSchema,
  provider: IdentityVerificationProviderSchema.optional().nullable(),
  vendor: IdentityVerificationVendorSchema.optional().nullable(),
  aadhaarLast4: z.string().length(4).optional().nullable(),
  nameOnId: z.string().optional().nullable(),
  yearOfBirth: z.number().int().optional().nullable(),
  failureCode: z.string().optional().nullable(),
  failureReason: z.string().optional().nullable(),
  verifiedAt: z.string().datetime().optional().nullable(),
  providerReferenceExpiresAt: z.string().datetime().optional().nullable(),
});

export type VerificationStatusResponse = z.infer<typeof VerificationStatusResponseSchema>;

export const VerificationWebhookSchema = z.object({
  event: z.string(),
  data: z.record(z.any()).optional(),
});

export type VerificationWebhook = z.infer<typeof VerificationWebhookSchema>;
