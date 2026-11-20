/**
 * Identity verification contracts — Phase 6 (KYC).
 */
import { z } from 'zod';
/**
 * The method a check was made with.
 *
 * `MANUAL_DOCUMENT` is the fallback: the member uploads a copy of their Aadhaar
 * and an administrator approves or rejects it. It exists because the DigiLocker
 * supplier can be unreachable for reasons that have nothing to do with a member
 * — in production it refuses this deployment's IP addresses — and identity
 * verification gates discovery for the whole product, so one supplier's network
 * policy must not be able to stop everyone from joining.
 */
export declare const IdentityVerificationProviderSchema: z.ZodEnum<["DIGILOCKER", "AADHAAR_UIDAI", "MANUAL_DOCUMENT"]>;
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
    provider: z.ZodEnum<["DIGILOCKER", "AADHAAR_UIDAI", "MANUAL_DOCUMENT"]>;
    /**
     * Which version of the Aadhaar-processing notice the user was shown. H3 makes
     * consent demonstrable, and a consent to "v1" is not consent to whatever v2
     * later says, so the version is part of the record rather than a constant.
     */
    policy_version: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    provider: "DIGILOCKER" | "AADHAAR_UIDAI" | "MANUAL_DOCUMENT";
    policy_version?: string | undefined;
}, {
    provider: "DIGILOCKER" | "AADHAAR_UIDAI" | "MANUAL_DOCUMENT";
    policy_version?: string | undefined;
}>;
export type InitiateVerificationRequest = z.infer<typeof InitiateVerificationSchema>;
export declare const VerificationStatusResponseSchema: z.ZodObject<{
    status: z.ZodEnum<["NOT_STARTED", "PENDING", "VERIFIED", "FAILED", "EXPIRED"]>;
    provider: z.ZodNullable<z.ZodOptional<z.ZodEnum<["DIGILOCKER", "AADHAAR_UIDAI", "MANUAL_DOCUMENT"]>>>;
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
    status: "NOT_STARTED" | "PENDING" | "VERIFIED" | "FAILED" | "EXPIRED";
    provider?: "DIGILOCKER" | "AADHAAR_UIDAI" | "MANUAL_DOCUMENT" | null | undefined;
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
    status: "NOT_STARTED" | "PENDING" | "VERIFIED" | "FAILED" | "EXPIRED";
    provider?: "DIGILOCKER" | "AADHAAR_UIDAI" | "MANUAL_DOCUMENT" | null | undefined;
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
        name?: string | undefined;
        dob?: string | undefined;
        gender?: string | undefined;
    }, {
        name?: string | undefined;
        dob?: string | undefined;
        gender?: string | undefined;
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
        name?: string | undefined;
        dob?: string | undefined;
        gender?: string | undefined;
    }, {
        name?: string | undefined;
        dob?: string | undefined;
        gender?: string | undefined;
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
        name?: string | undefined;
        dob?: string | undefined;
        gender?: string | undefined;
    }, {
        name?: string | undefined;
        dob?: string | undefined;
        gender?: string | undefined;
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
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
        }, {
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
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
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
        }, {
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
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
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
        }, {
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
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
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
        }, {
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
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
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
        }, {
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
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
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
        }, {
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
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
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
        }, {
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
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
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
        }, {
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
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
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
        }, {
            name?: string | undefined;
            dob?: string | undefined;
            gender?: string | undefined;
        }>>;
        document_requested: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        document_consent: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodString, "many">>>;
    }, z.ZodTypeAny, "passthrough">>>;
}, z.ZodTypeAny, "passthrough">>;
export type VerificationWebhook = z.infer<typeof VerificationWebhookSchema>;
export type VerificationWebhookData = z.infer<typeof VerificationWebhookDataSchema>;
/**
 * What a member may upload.
 *
 * A photo of the card is the realistic case, so images are accepted alongside a
 * PDF (many people have a scanned copy). SVG is excluded everywhere in this
 * product because it is a script container.
 */
export declare const MANUAL_DOCUMENT_MIME_TYPES: readonly ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export declare const MAX_MANUAL_DOCUMENT_BYTES: number;
/**
 * Reserves an upload for a document check.
 *
 * The same handshake as photos and biodata: reserve a key, send the bytes, then
 * submit the key. The reservation is what bounds the upload before any bytes
 * move.
 */
export declare const InitiateManualDocumentUploadSchema: z.ZodObject<{
    mime_type: z.ZodEnum<["image/jpeg", "image/png", "image/webp", "application/pdf"]>;
    byte_size: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    mime_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
    byte_size: number;
}, {
    mime_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
    byte_size: number;
}>;
export type InitiateManualDocumentUploadInput = z.infer<typeof InitiateManualDocumentUploadSchema>;
/** A reserved upload slot, the same shape the other uploads return. */
export declare const ManualDocumentTicketSchema: z.ZodObject<{
    upload_url: z.ZodString;
    object_key: z.ZodString;
    expires_in_seconds: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    upload_url: string;
    object_key: string;
    expires_in_seconds: number;
}, {
    upload_url: string;
    object_key: string;
    expires_in_seconds: number;
}>;
export type ManualDocumentTicket = z.infer<typeof ManualDocumentTicketSchema>;
/**
 * Puts the uploaded document forward for review.
 *
 * `policy_version` is required here, unlike the DigiLocker initiate where it is
 * optional: this path *stores a copy of an identity document*, so the version of
 * the notice the member was shown is part of the record, not a detail.
 */
export declare const SubmitManualDocumentSchema: z.ZodObject<{
    object_key: z.ZodString;
    policy_version: z.ZodString;
}, "strict", z.ZodTypeAny, {
    policy_version: string;
    object_key: string;
}, {
    policy_version: string;
    object_key: string;
}>;
export type SubmitManualDocumentInput = z.infer<typeof SubmitManualDocumentSchema>;
/** Event names Cashfree Secure ID sends for the DigiLocker journey. */
export declare const DIGILOCKER_EVENTS: {
    readonly success: "DIGILOCKER_VERIFICATION_SUCCESS";
    readonly failure: "DIGILOCKER_VERIFICATION_FAILURE";
    readonly consentDenied: "DIGILOCKER_VERIFICATION_CONSENT_DENIED";
    readonly linkExpired: "DIGILOCKER_VERIFICATION_LINK_EXPIRED";
    readonly consentExpired: "DIGILOCKER_VERIFICATION_CONSENT_EXPIRED";
};
//# sourceMappingURL=verification.d.ts.map