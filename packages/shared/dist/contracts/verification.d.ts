/**
 * Identity verification contracts — Phase 6 (KYC).
 */
import { z } from 'zod';
export declare const IdentityVerificationProviderSchema: z.ZodEnum<["DIGILOCKER", "AADHAAR_UIDAI"]>;
export type IdentityVerificationProvider = z.infer<typeof IdentityVerificationProviderSchema>;
export declare const IdentityVerificationVendorSchema: z.ZodEnum<["CASHFREE"]>;
export type IdentityVerificationVendor = z.infer<typeof IdentityVerificationVendorSchema>;
/**
 * `NOT_STARTED` is a response-only state: it is what the status endpoint says
 * about an account with no verification row yet, so the app can show "start
 * verification" instead of treating its own first visit as an error. It is
 * never written to the database — `IdentityVerificationStatus` in the Prisma
 * schema has only the four stored values.
 */
export declare const IdentityVerificationStatusSchema: z.ZodEnum<["NOT_STARTED", "PENDING", "VERIFIED", "FAILED", "EXPIRED"]>;
export type IdentityVerificationStatus = z.infer<typeof IdentityVerificationStatusSchema>;
export declare const InitiateVerificationSchema: z.ZodObject<{
    provider: z.ZodEnum<["DIGILOCKER", "AADHAAR_UIDAI"]>;
    /**
     * Which version of the Aadhaar-processing notice the user was shown. H3 makes
     * consent demonstrable, and a consent to "v1" is not consent to whatever v2
     * later says, so the version is part of the record rather than a constant.
     */
    policy_version: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    provider: "DIGILOCKER" | "AADHAAR_UIDAI";
    policy_version?: string | undefined;
}, {
    provider: "DIGILOCKER" | "AADHAAR_UIDAI";
    policy_version?: string | undefined;
}>;
export type InitiateVerificationRequest = z.infer<typeof InitiateVerificationSchema>;
export declare const VerificationStatusResponseSchema: z.ZodObject<{
    status: z.ZodEnum<["NOT_STARTED", "PENDING", "VERIFIED", "FAILED", "EXPIRED"]>;
    provider: z.ZodNullable<z.ZodOptional<z.ZodEnum<["DIGILOCKER", "AADHAAR_UIDAI"]>>>;
    vendor: z.ZodNullable<z.ZodOptional<z.ZodEnum<["CASHFREE"]>>>;
    aadhaarLast4: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    nameOnId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    yearOfBirth: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    failureCode: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    failureReason: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    verifiedAt: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    /**
     * The DigiLocker consent URL to open. Cashfree hands it out when the session
     * is created and it expires in ten minutes, so it is returned with the
     * initiate response only — it is not persisted, and there is nothing useful
     * to hand out on the status call.
     */
    redirect_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    /** Absolute expiry of `redirect_url`; past this the app must start again. */
    providerReferenceExpiresAt: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status: "PENDING" | "FAILED" | "EXPIRED" | "NOT_STARTED" | "VERIFIED";
    provider?: "DIGILOCKER" | "AADHAAR_UIDAI" | null | undefined;
    vendor?: "CASHFREE" | null | undefined;
    aadhaarLast4?: string | null | undefined;
    nameOnId?: string | null | undefined;
    yearOfBirth?: number | null | undefined;
    failureCode?: string | null | undefined;
    failureReason?: string | null | undefined;
    verifiedAt?: string | null | undefined;
    redirect_url?: string | null | undefined;
    providerReferenceExpiresAt?: string | null | undefined;
}, {
    status: "PENDING" | "FAILED" | "EXPIRED" | "NOT_STARTED" | "VERIFIED";
    provider?: "DIGILOCKER" | "AADHAAR_UIDAI" | null | undefined;
    vendor?: "CASHFREE" | null | undefined;
    aadhaarLast4?: string | null | undefined;
    nameOnId?: string | null | undefined;
    yearOfBirth?: number | null | undefined;
    failureCode?: string | null | undefined;
    failureReason?: string | null | undefined;
    verifiedAt?: string | null | undefined;
    redirect_url?: string | null | undefined;
    providerReferenceExpiresAt?: string | null | undefined;
}>;
export type VerificationStatusResponse = z.infer<typeof VerificationStatusResponseSchema>;
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
export declare const VerificationWebhookDataSchema: z.ZodObject<{
    verification_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    reference_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    status: z.ZodOptional<z.ZodString>;
    user_details: z.ZodOptional<z.ZodObject<{
        name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        dob: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        gender: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        gender?: string | undefined;
        name?: string | undefined;
        dob?: string | undefined;
    }, {
        gender?: string | undefined;
        name?: string | undefined;
        dob?: string | undefined;
    }>>;
    document_requested: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    document_consent: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    verification_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    reference_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    status: z.ZodOptional<z.ZodString>;
    user_details: z.ZodOptional<z.ZodObject<{
        name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        dob: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        gender: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        gender?: string | undefined;
        name?: string | undefined;
        dob?: string | undefined;
    }, {
        gender?: string | undefined;
        name?: string | undefined;
        dob?: string | undefined;
    }>>;
    document_requested: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    document_consent: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    verification_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    reference_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    status: z.ZodOptional<z.ZodString>;
    user_details: z.ZodOptional<z.ZodObject<{
        name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        dob: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        gender: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        gender?: string | undefined;
        name?: string | undefined;
        dob?: string | undefined;
    }, {
        gender?: string | undefined;
        name?: string | undefined;
        dob?: string | undefined;
    }>>;
    document_requested: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    document_consent: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
}, z.ZodTypeAny, "passthrough">>;
export declare const VerificationWebhookSchema: z.ZodObject<{
    event_type: z.ZodString;
    event_time: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodObject<{
        verification_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        reference_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        status: z.ZodOptional<z.ZodString>;
        user_details: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            dob: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            gender: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }>>;
        document_requested: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        document_consent: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        verification_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        reference_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        status: z.ZodOptional<z.ZodString>;
        user_details: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            dob: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            gender: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }>>;
        document_requested: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        document_consent: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        verification_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        reference_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        status: z.ZodOptional<z.ZodString>;
        user_details: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            dob: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            gender: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }>>;
        document_requested: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        document_consent: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    }, z.ZodTypeAny, "passthrough">>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    event_type: z.ZodString;
    event_time: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodObject<{
        verification_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        reference_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        status: z.ZodOptional<z.ZodString>;
        user_details: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            dob: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            gender: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }>>;
        document_requested: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        document_consent: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        verification_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        reference_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        status: z.ZodOptional<z.ZodString>;
        user_details: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            dob: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            gender: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }>>;
        document_requested: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        document_consent: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        verification_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        reference_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        status: z.ZodOptional<z.ZodString>;
        user_details: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            dob: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            gender: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }>>;
        document_requested: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        document_consent: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    event_type: z.ZodString;
    event_time: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodObject<{
        verification_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        reference_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        status: z.ZodOptional<z.ZodString>;
        user_details: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            dob: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            gender: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }>>;
        document_requested: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        document_consent: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        verification_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        reference_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        status: z.ZodOptional<z.ZodString>;
        user_details: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            dob: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            gender: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }>>;
        document_requested: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        document_consent: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        verification_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        reference_id: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        status: z.ZodOptional<z.ZodString>;
        user_details: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            dob: z.ZodOptional<z.ZodOptional<z.ZodString>>;
            gender: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }, {
            gender?: string | undefined;
            name?: string | undefined;
            dob?: string | undefined;
        }>>;
        document_requested: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        document_consent: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">>;
export type VerificationWebhook = z.infer<typeof VerificationWebhookSchema>;
export type VerificationWebhookData = z.infer<typeof VerificationWebhookDataSchema>;
/** Event names Cashfree Secure ID sends for the DigiLocker journey. */
export declare const DIGILOCKER_EVENTS: {
    readonly success: "DIGILOCKER_VERIFICATION_SUCCESS";
    readonly failure: "DIGILOCKER_VERIFICATION_FAILURE";
    readonly consentDenied: "DIGILOCKER_VERIFICATION_CONSENT_DENIED";
    readonly linkExpired: "DIGILOCKER_VERIFICATION_LINK_EXPIRED";
    readonly consentExpired: "DIGILOCKER_VERIFICATION_CONSENT_EXPIRED";
};
//# sourceMappingURL=verification.d.ts.map