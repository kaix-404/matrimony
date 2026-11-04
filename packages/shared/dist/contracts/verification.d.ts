/**
 * Identity verification contracts � Phase 6 (KYC).
 */
import { z } from 'zod';
export declare const IdentityVerificationProviderSchema: z.ZodEnum<["DIGILOCKER", "AADHAAR_UIDAI"]>;
export type IdentityVerificationProvider = z.infer<typeof IdentityVerificationProviderSchema>;
export declare const IdentityVerificationVendorSchema: z.ZodEnum<["CASHFREE"]>;
export type IdentityVerificationVendor = z.infer<typeof IdentityVerificationVendorSchema>;
export declare const IdentityVerificationStatusSchema: z.ZodEnum<["PENDING", "VERIFIED", "FAILED", "EXPIRED"]>;
export type IdentityVerificationStatus = z.infer<typeof IdentityVerificationStatusSchema>;
export declare const InitiateVerificationSchema: z.ZodObject<{
    provider: z.ZodEnum<["DIGILOCKER", "AADHAAR_UIDAI"]>;
}, "strip", z.ZodTypeAny, {
    provider: "DIGILOCKER" | "AADHAAR_UIDAI";
}, {
    provider: "DIGILOCKER" | "AADHAAR_UIDAI";
}>;
export type InitiateVerificationRequest = z.infer<typeof InitiateVerificationSchema>;
export declare const VerificationStatusResponseSchema: z.ZodObject<{
    status: z.ZodEnum<["PENDING", "VERIFIED", "FAILED", "EXPIRED"]>;
    provider: z.ZodNullable<z.ZodOptional<z.ZodEnum<["DIGILOCKER", "AADHAAR_UIDAI"]>>>;
    vendor: z.ZodNullable<z.ZodOptional<z.ZodEnum<["CASHFREE"]>>>;
    aadhaarLast4: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    nameOnId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    yearOfBirth: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    failureCode: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    failureReason: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    verifiedAt: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    providerReferenceExpiresAt: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status: "PENDING" | "FAILED" | "EXPIRED" | "VERIFIED";
    provider?: "DIGILOCKER" | "AADHAAR_UIDAI" | null | undefined;
    vendor?: "CASHFREE" | null | undefined;
    aadhaarLast4?: string | null | undefined;
    nameOnId?: string | null | undefined;
    yearOfBirth?: number | null | undefined;
    failureCode?: string | null | undefined;
    failureReason?: string | null | undefined;
    verifiedAt?: string | null | undefined;
    providerReferenceExpiresAt?: string | null | undefined;
}, {
    status: "PENDING" | "FAILED" | "EXPIRED" | "VERIFIED";
    provider?: "DIGILOCKER" | "AADHAAR_UIDAI" | null | undefined;
    vendor?: "CASHFREE" | null | undefined;
    aadhaarLast4?: string | null | undefined;
    nameOnId?: string | null | undefined;
    yearOfBirth?: number | null | undefined;
    failureCode?: string | null | undefined;
    failureReason?: string | null | undefined;
    verifiedAt?: string | null | undefined;
    providerReferenceExpiresAt?: string | null | undefined;
}>;
export type VerificationStatusResponse = z.infer<typeof VerificationStatusResponseSchema>;
export declare const VerificationWebhookSchema: z.ZodObject<{
    event: z.ZodString;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    event: string;
    data?: Record<string, any> | undefined;
}, {
    event: string;
    data?: Record<string, any> | undefined;
}>;
export type VerificationWebhook = z.infer<typeof VerificationWebhookSchema>;
//# sourceMappingURL=verification.d.ts.map