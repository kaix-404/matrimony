"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIGILOCKER_EVENTS = exports.VerificationWebhookSchema = exports.VerificationWebhookDataSchema = exports.VerificationStatusResponseSchema = exports.InitiateVerificationSchema = exports.IdentityVerificationStatusSchema = exports.IdentityVerificationVendorSchema = exports.IdentityVerificationProviderSchema = void 0;
/**
 * Identity verification contracts — Phase 6 (KYC).
 */
const zod_1 = require("zod");
exports.IdentityVerificationProviderSchema = zod_1.z.enum(['DIGILOCKER', 'AADHAAR_UIDAI']);
exports.IdentityVerificationVendorSchema = zod_1.z.enum(['CASHFREE']);
/**
 * `NOT_STARTED` is a response-only state: it is what the status endpoint says
 * about an account with no verification row yet, so the app can show "start
 * verification" instead of treating its own first visit as an error. It is
 * never written to the database — `IdentityVerificationStatus` in the Prisma
 * schema has only the four stored values.
 */
exports.IdentityVerificationStatusSchema = zod_1.z.enum([
    'NOT_STARTED',
    'PENDING',
    'VERIFIED',
    'FAILED',
    'EXPIRED',
]);
exports.InitiateVerificationSchema = zod_1.z.object({
    provider: exports.IdentityVerificationProviderSchema,
    /**
     * Which version of the Aadhaar-processing notice the user was shown. H3 makes
     * consent demonstrable, and a consent to "v1" is not consent to whatever v2
     * later says, so the version is part of the record rather than a constant.
     */
    policy_version: zod_1.z.string().min(1).optional(),
});
exports.VerificationStatusResponseSchema = zod_1.z.object({
    status: exports.IdentityVerificationStatusSchema,
    provider: exports.IdentityVerificationProviderSchema.optional().nullable(),
    vendor: exports.IdentityVerificationVendorSchema.optional().nullable(),
    aadhaarLast4: zod_1.z.string().length(4).optional().nullable(),
    nameOnId: zod_1.z.string().optional().nullable(),
    yearOfBirth: zod_1.z.number().int().optional().nullable(),
    failureCode: zod_1.z.string().optional().nullable(),
    failureReason: zod_1.z.string().optional().nullable(),
    verifiedAt: zod_1.z.string().datetime().optional().nullable(),
    /**
     * The DigiLocker consent URL to open. Cashfree hands it out when the session
     * is created and it expires in ten minutes, so it is returned with the
     * initiate response only — it is not persisted, and there is nothing useful
     * to hand out on the status call.
     */
    redirect_url: zod_1.z.string().url().nullable().optional(),
    /** Absolute expiry of `redirect_url`; past this the app must start again. */
    providerReferenceExpiresAt: zod_1.z.string().datetime().optional().nullable(),
});
const VerifiableId = zod_1.z.union([zod_1.z.string(), zod_1.z.number()]);
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
exports.VerificationWebhookDataSchema = zod_1.z
    .object({
    verification_id: VerifiableId.optional(),
    reference_id: VerifiableId.optional(),
    status: zod_1.z.string().optional(),
    user_details: zod_1.z
        .object({
        name: zod_1.z.string().optional(),
        dob: zod_1.z.string().optional(),
        gender: zod_1.z.string().optional(),
    })
        .partial()
        .optional(),
    document_requested: zod_1.z.array(zod_1.z.string()).optional(),
    document_consent: zod_1.z.array(zod_1.z.string()).nullable().optional(),
})
    .passthrough();
exports.VerificationWebhookSchema = zod_1.z
    .object({
    event_type: zod_1.z.string().min(1),
    event_time: zod_1.z.string().optional(),
    version: zod_1.z.string().optional(),
    data: exports.VerificationWebhookDataSchema.optional(),
})
    .passthrough();
/** Event names Cashfree Secure ID sends for the DigiLocker journey. */
exports.DIGILOCKER_EVENTS = {
    success: 'DIGILOCKER_VERIFICATION_SUCCESS',
    failure: 'DIGILOCKER_VERIFICATION_FAILURE',
    consentDenied: 'DIGILOCKER_VERIFICATION_CONSENT_DENIED',
    linkExpired: 'DIGILOCKER_VERIFICATION_LINK_EXPIRED',
    consentExpired: 'DIGILOCKER_VERIFICATION_CONSENT_EXPIRED',
};
//# sourceMappingURL=verification.js.map