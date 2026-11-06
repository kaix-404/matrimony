/**
 * Identity verification contracts — Phase 6 (KYC).
 */
import { z } from 'zod';

export const IdentityVerificationProviderSchema = z.enum(['DIGILOCKER', 'AADHAAR_UIDAI']);
export type IdentityVerificationProvider = z.infer<typeof IdentityVerificationProviderSchema>;

export const IdentityVerificationVendorSchema = z.enum(['CASHFREE']);
export type IdentityVerificationVendor = z.infer<typeof IdentityVerificationVendorSchema>;

/**
 * `NOT_STARTED` is a response-only state: it is what the status endpoint says
 * about an account with no verification row yet, so the app can show "start
 * verification" instead of treating its own first visit as an error. It is
 * never written to the database — `IdentityVerificationStatus` in the Prisma
 * schema has only the four stored values.
 */
export const IdentityVerificationStatusSchema = z.enum([
  'NOT_STARTED',
  'PENDING',
  'VERIFIED',
  'FAILED',
  'EXPIRED',
]);
export type IdentityVerificationStatus = z.infer<typeof IdentityVerificationStatusSchema>;

export const InitiateVerificationSchema = z.object({
  provider: IdentityVerificationProviderSchema,
  /**
   * Which version of the Aadhaar-processing notice the user was shown. H3 makes
   * consent demonstrable, and a consent to "v1" is not consent to whatever v2
   * later says, so the version is part of the record rather than a constant.
   */
  policy_version: z.string().min(1).optional(),
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
  /**
   * The DigiLocker consent URL to open. Cashfree hands it out when the session
   * is created and it expires in ten minutes, so it is returned with the
   * initiate response only — it is not persisted, and there is nothing useful
   * to hand out on the status call.
   */
  redirect_url: z.string().url().nullable().optional(),
  /** Absolute expiry of `redirect_url`; past this the app must start again. */
  providerReferenceExpiresAt: z.string().datetime().optional().nullable(),
});

export type VerificationStatusResponse = z.infer<typeof VerificationStatusResponseSchema>;

const VerifiableId = z.union([z.string(), z.number()]);

/**
 * The DigiLocker webhook body, as Cashfree actually sends it:
 *
 *   { event_type, event_time, version, data: { verification_id, reference_id,
 *     status, user_details: { name, dob, gender }, document_requested, ... } }
 *
 * Only the fields the service acts on are typed. The object passes unknown keys
 * through on purpose: the vendor adds fields (and events) without warning, and
 * a strict schema would turn that into a rejected webhook — an outage caused by
 * us being more precise than the sender.
 */
export const VerificationWebhookDataSchema = z
  .object({
    verification_id: VerifiableId.optional(),
    reference_id: VerifiableId.optional(),
    status: z.string().optional(),
    user_details: z
      .object({
        name: z.string().optional(),
        dob: z.string().optional(),
        gender: z.string().optional(),
      })
      .partial()
      .optional(),
    document_requested: z.array(z.string()).optional(),
    document_consent: z.array(z.string()).nullable().optional(),
  })
  .passthrough();

export const VerificationWebhookSchema = z
  .object({
    event_type: z.string().min(1),
    event_time: z.string().optional(),
    version: z.string().optional(),
    data: VerificationWebhookDataSchema.optional(),
  })
  .passthrough();

export type VerificationWebhook = z.infer<typeof VerificationWebhookSchema>;
export type VerificationWebhookData = z.infer<typeof VerificationWebhookDataSchema>;

/** Event names Cashfree Secure ID sends for the DigiLocker journey. */
export const DIGILOCKER_EVENTS = {
  success: 'DIGILOCKER_VERIFICATION_SUCCESS',
  failure: 'DIGILOCKER_VERIFICATION_FAILURE',
  consentDenied: 'DIGILOCKER_VERIFICATION_CONSENT_DENIED',
  linkExpired: 'DIGILOCKER_VERIFICATION_LINK_EXPIRED',
  consentExpired: 'DIGILOCKER_VERIFICATION_CONSENT_EXPIRED',
} as const;
