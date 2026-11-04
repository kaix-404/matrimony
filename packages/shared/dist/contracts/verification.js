"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationWebhookSchema = exports.VerificationStatusResponseSchema = exports.InitiateVerificationSchema = exports.IdentityVerificationStatusSchema = exports.IdentityVerificationVendorSchema = exports.IdentityVerificationProviderSchema = void 0;
/**
 * Identity verification contracts � Phase 6 (KYC).
 */
const zod_1 = require("zod");
exports.IdentityVerificationProviderSchema = zod_1.z.enum(['DIGILOCKER', 'AADHAAR_UIDAI']);
exports.IdentityVerificationVendorSchema = zod_1.z.enum(['CASHFREE']);
exports.IdentityVerificationStatusSchema = zod_1.z.enum(['PENDING', 'VERIFIED', 'FAILED', 'EXPIRED']);
exports.InitiateVerificationSchema = zod_1.z.object({
    provider: exports.IdentityVerificationProviderSchema,
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
    providerReferenceExpiresAt: zod_1.z.string().datetime().optional().nullable(),
});
exports.VerificationWebhookSchema = zod_1.z.object({
    event: zod_1.z.string(),
    data: zod_1.z.record(zod_1.z.any()).optional(),
});
//# sourceMappingURL=verification.js.map