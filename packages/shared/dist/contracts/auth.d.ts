/**
 * Authentication contracts — spec sections 6, 7, 41; client answer D9.
 *
 * WHY MOBILE ONLY
 * ---------------
 * Section 6 identifies a user by mobile number alone: no email, no password.
 * The request schemas therefore have no email field to forget to validate, and
 * no password field that could be stored by mistake. Adding either later is a
 * schema change, which is the point — it should be deliberate.
 *
 * OTP CODES ARE 6 DIGITS
 * ----------------------
 * Short numeric codes are guessable, so `OtpRequest` stores a hash and the
 * service enforces an attempt ceiling per request. The number of digits is
 * declared once here and asserted against the service, so a "temporarily"
 * 4-digit code cannot pass validation in one place and be generated as 6 in
 * another.
 */
import { z } from 'zod';
/** Digit count for OTP codes. Mirrors `OTP_CODE_LENGTH` in the OTP service. */
export declare const OTP_CODE_LENGTH = 6;
/**
 * Normalises an Indian mobile number to its 10-digit form.
 *
 * Clients send this inconsistently — `9876543210`, `+919876543210`,
 * `919876543210` are the same person — and the number is the sole account
 * identifier, so the two spellings must not create two accounts. Normalising at
 * the edge is what guarantees that; validating only that "it looks like a
 * number" would let the duplication through.
 */
export declare const IndianMobileSchema: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>;
export type IndianMobile = z.infer<typeof IndianMobileSchema>;
export declare const OTP_PURPOSES: readonly ["REGISTRATION", "LOGIN", "DELETE_ACCOUNT", "CATEGORY_REVIEW", "CHANGE_MOBILE", "CHANGE_EMAIL"];
export type OtpPurpose = (typeof OTP_PURPOSES)[number];
/**
 * Requesting a code never reveals whether the mobile is already registered.
 *
 * A registration endpoint that answers differently for a known number is a free
 * enumeration oracle for the entire user base, so the response shape is
 * identical either way and account existence is decided later, at verify time,
 * where it is only observable to someone who holds the code.
 */
export declare const RequestOtpSchema: z.ZodObject<{
    mobile: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>;
    purpose: z.ZodEnum<["REGISTRATION", "LOGIN", "DELETE_ACCOUNT", "CATEGORY_REVIEW", "CHANGE_MOBILE", "CHANGE_EMAIL"]>;
    /** Free-form device identifier; recorded for rate-limit auditing only. */
    device_id: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    mobile: string;
    purpose: "REGISTRATION" | "LOGIN" | "DELETE_ACCOUNT" | "CATEGORY_REVIEW" | "CHANGE_MOBILE" | "CHANGE_EMAIL";
    device_id?: string | undefined;
}, {
    mobile: string;
    purpose: "REGISTRATION" | "LOGIN" | "DELETE_ACCOUNT" | "CATEGORY_REVIEW" | "CHANGE_MOBILE" | "CHANGE_EMAIL";
    device_id?: string | undefined;
}>;
export type RequestOtpInput = z.infer<typeof RequestOtpSchema>;
/**
 * What the client is told after requesting a code. Identical for every outcome;
 * only `resend_after_seconds` varies, and that varies by cooldown, not by
 * whether the account exists.
 */
export declare const OtpRequestedSchema: z.ZodObject<{
    message: z.ZodString;
    /** Seconds until another code may be requested. */
    resend_after_seconds: z.ZodNumber;
    expires_in_seconds: z.ZodNumber;
    /**
     * Development only: set when the code was NOT texted and is echoed below
     * as `dev_code` instead, so a developer is told the SMS did not go out
     * rather than assuming delivery worked.
     */
    delivery_warning: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    message: string;
    resend_after_seconds: number;
    expires_in_seconds: number;
    delivery_warning?: string | undefined;
}, {
    message: string;
    resend_after_seconds: number;
    expires_in_seconds: number;
    delivery_warning?: string | undefined;
}>;
export type OtpRequested = z.infer<typeof OtpRequestedSchema>;
/**
 * The machine-readable `code` on a failed `POST /auth/otp/request` when the API
 * could not hand the code to the SMS provider, so no message was sent.
 *
 * A code rather than a message because the two audiences need different words.
 * The operator needs "the SMS wallet is empty" — that is what the API says in
 * its logs, and it is meaningless on a phone. A client that can recognise this
 * code can show copy that is honest to the user ("we could not text you just
 * now") without publishing a vendor diagnostic, and can tell a refusal apart
 * from a validation error or an outage instead of printing a generic failure.
 */
export declare const SMS_UNAVAILABLE_CODE = "SMS_UNAVAILABLE";
/**
 * Completing a change of the account's mobile number.
 *
 * The number is the login identity, so this is a verified swap rather than a
 * profile edit: a code sent to the NEW number proves the member can receive it,
 * and the bearer token proves they are already signed in as the account. The
 * code is bound to `CHANGE_MOBILE`, so a login code cannot be reused here.
 */
export declare const ChangeMobileSchema: z.ZodObject<{
    mobile: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>;
    code: z.ZodString;
}, "strict", z.ZodTypeAny, {
    code: string;
    mobile: string;
}, {
    code: string;
    mobile: string;
}>;
export type ChangeMobileInput = z.infer<typeof ChangeMobileSchema>;
/**
 * An email address, normalised the same way the account stores it.
 *
 * Lower-cased at the edge because the unique index is case-sensitive: without
 * this, alice@example.com and Alice@Example.com would be two accounts' worth of
 * the same mailbox, and a member who typed a capital letter would be refused
 * their own address.
 */
export declare const EmailAddressSchema: z.ZodString;
export type EmailAddress = z.infer<typeof EmailAddressSchema>;
/**
 * Adds an email to the account, or moves it to a different address.
 *
 * The addressee proves the address by code, the bearer token proves the account.
 * The email is not a login identity here, so this does not revoke sessions —
 * losing access to a mailbox must not sign a member out of the app they are
 * already using.
 */
export declare const ChangeEmailSchema: z.ZodObject<{
    email: z.ZodString;
    code: z.ZodString;
}, "strict", z.ZodTypeAny, {
    code: string;
    email: string;
}, {
    code: string;
    email: string;
}>;
export type ChangeEmailInput = z.infer<typeof ChangeEmailSchema>;
/**
 * Requests a code at an email address for the signed-in account.
 *
 * The account comes from the token, not the body: an endpoint that accepted a
 * user id here would let any member attach their own address to somebody else's
 * account, and would make the reachable address set enumerable.
 */
export declare const RequestEmailOtpSchema: z.ZodObject<{
    email: z.ZodString;
}, "strict", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export type RequestEmailOtpInput = z.infer<typeof RequestEmailOtpSchema>;
/**
 * The code on a failed email send, mirroring `SMS_UNAVAILABLE_CODE`.
 *
 * The app needs to tell "we could not email you" apart from "that address is
 * invalid" or an outage, and the vendor's wording belongs in the log.
 */
export declare const EMAIL_UNAVAILABLE_CODE = "EMAIL_UNAVAILABLE";
export declare const VerifyOtpSchema: z.ZodObject<{
    mobile: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>;
    purpose: z.ZodEnum<["REGISTRATION", "LOGIN", "DELETE_ACCOUNT", "CATEGORY_REVIEW", "CHANGE_MOBILE", "CHANGE_EMAIL"]>;
    code: z.ZodString;
}, "strict", z.ZodTypeAny, {
    code: string;
    mobile: string;
    purpose: "REGISTRATION" | "LOGIN" | "DELETE_ACCOUNT" | "CATEGORY_REVIEW" | "CHANGE_MOBILE" | "CHANGE_EMAIL";
}, {
    code: string;
    mobile: string;
    purpose: "REGISTRATION" | "LOGIN" | "DELETE_ACCOUNT" | "CATEGORY_REVIEW" | "CHANGE_MOBILE" | "CHANGE_EMAIL";
}>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
/**
 * Registration continues after a code is verified.
 *
 * `networth_category` is required here rather than at OTP time because it is a
 * schema foreign key: `User.networthCategory` is non-null, so a user row cannot
 * exist before a category is chosen. Requiring it later would mean a partial
 * user row, which section 36 forbids.
 */
export declare const CompleteRegistrationSchema: z.ZodObject<{
    mobile: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>;
    /** Net-worth band key from `net_worth_category_ref`, not a hardcoded enum. */
    networth_category: z.ZodString;
}, "strict", z.ZodTypeAny, {
    mobile: string;
    networth_category: string;
}, {
    mobile: string;
    networth_category: string;
}>;
export type CompleteRegistrationInput = z.infer<typeof CompleteRegistrationSchema>;
export declare const TokenPairSchema: z.ZodObject<{
    access_token: z.ZodString;
    refresh_token: z.ZodString;
    token_type: z.ZodLiteral<"Bearer">;
    expires_in: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    access_token: string;
    refresh_token: string;
    token_type: "Bearer";
    expires_in: number;
}, {
    access_token: string;
    refresh_token: string;
    token_type: "Bearer";
    expires_in: number;
}>;
export type TokenPair = z.infer<typeof TokenPairSchema>;
/**
 * Access token claims.
 *
 * Kept here rather than in the API so the mobile app can decode a token without
 * duplicating the shape. The payload is readable by anyone holding it — it is
 * signed, not encrypted — so it holds identifiers and nothing sensitive. A
 * net-worth band and account status are enough for the app to render its
 * navigation, and neither is a secret.
 */
export interface AccessTokenClaims {
    /** User id. */
    sub: string;
    /** Token type. Guards against a refresh token being replayed as access. */
    typ: 'access';
    /** Account status at issue time; re-read on refresh, never trusted long-term. */
    status: string;
    /** Net-worth band. Section 36: the partition key for discovery. */
    cat: string;
    /** Issued-at, seconds since epoch. */
    iat: number;
    /** Expiry, seconds since epoch. */
    exp: number;
}
export declare const RefreshSchema: z.ZodObject<{
    refresh_token: z.ZodString;
}, "strict", z.ZodTypeAny, {
    refresh_token: string;
}, {
    refresh_token: string;
}>;
/**
 * The authenticated user as the app sees it.
 *
 * Deliberately narrow. This is not a profile: no name, no contact details, no
 * net-worth figures. It carries only what the app needs to decide navigation
 * and gating — the next onboarding step, and which sections to show.
 */
export declare const CurrentUserSchema: z.ZodObject<{
    id: z.ZodString;
    mobile: z.ZodString;
    status: z.ZodEnum<["PENDING_CATEGORY", "PENDING_VERIFICATION", "AWAITING_SETUP_FEE", "ACTIVE", "SUSPENDED", "DELETED"]>;
    networth_category: z.ZodString;
    is_phone_verified: z.ZodBoolean;
    identity_verified: z.ZodBoolean;
    setup_fee_paid: z.ZodBoolean;
    /** True only when status is ACTIVE: verified, paid, not suspended. */
    can_discover: z.ZodBoolean;
    profile_complete: z.ZodBoolean;
    /**
     * Whether a profile row exists at all — not whether it is finished.
     *
     * `profile_complete` is false both for a member who never started and one
     * holding a draft. The app needs the difference: the first has to be sent
     * back to the onboarding form, which creates the row, and the second must
     * edit what already exists.
     */
    has_profile: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    mobile: string;
    status: "PENDING_CATEGORY" | "PENDING_VERIFICATION" | "AWAITING_SETUP_FEE" | "ACTIVE" | "SUSPENDED" | "DELETED";
    networth_category: string;
    id: string;
    is_phone_verified: boolean;
    identity_verified: boolean;
    setup_fee_paid: boolean;
    can_discover: boolean;
    profile_complete: boolean;
    has_profile: boolean;
}, {
    mobile: string;
    status: "PENDING_CATEGORY" | "PENDING_VERIFICATION" | "AWAITING_SETUP_FEE" | "ACTIVE" | "SUSPENDED" | "DELETED";
    networth_category: string;
    id: string;
    is_phone_verified: boolean;
    identity_verified: boolean;
    setup_fee_paid: boolean;
    can_discover: boolean;
    profile_complete: boolean;
    has_profile: boolean;
}>;
export type CurrentUser = z.infer<typeof CurrentUserSchema>;
//# sourceMappingURL=auth.d.ts.map