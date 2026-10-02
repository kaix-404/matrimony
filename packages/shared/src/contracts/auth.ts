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
export const OTP_CODE_LENGTH = 6;

/**
 * Normalises an Indian mobile number to its 10-digit form.
 *
 * Clients send this inconsistently — `9876543210`, `+919876543210`,
 * `919876543210` are the same person — and the number is the sole account
 * identifier, so the two spellings must not create two accounts. Normalising at
 * the edge is what guarantees that; validating only that "it looks like a
 * number" would let the duplication through.
 */
export const IndianMobileSchema = z
  .string()
  .trim()
  // Spaces, dashes and brackets are formatting, not identity. Clients add them
  // when a user types or auto-formats a number, and rejecting "+91 98765 43210"
  // would fail a legitimate input rather than prevent a duplicate account.
  .transform((v) => v.replace(/[\s\-()]/g, ''))
  .transform((v) => v.replace(/^\+91/, '').replace(/^91(?=[6-9]\d{9}$)/, ''))
  .refine((v) => /^[6-9]\d{9}$/.test(v), 'must be a 10-digit Indian mobile number');

export type IndianMobile = z.infer<typeof IndianMobileSchema>;

export const OTP_PURPOSES = ['REGISTRATION', 'LOGIN', 'DELETE_ACCOUNT', 'CATEGORY_REVIEW'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/**
 * Requesting a code never reveals whether the mobile is already registered.
 *
 * A registration endpoint that answers differently for a known number is a free
 * enumeration oracle for the entire user base, so the response shape is
 * identical either way and account existence is decided later, at verify time,
 * where it is only observable to someone who holds the code.
 */
export const RequestOtpSchema = z
  .object({
    mobile: IndianMobileSchema,
    purpose: z.enum(OTP_PURPOSES),
    /** Free-form device identifier; recorded for rate-limit auditing only. */
    device_id: z.string().max(128).optional(),
  })
  .strict();

export type RequestOtpInput = z.infer<typeof RequestOtpSchema>;

/**
 * What the client is told after requesting a code. Identical for every outcome;
 * only `resend_after_seconds` varies, and that varies by cooldown, not by
 * whether the account exists.
 */
export const OtpRequestedSchema = z
  .object({
    message: z.string(),
    /** Seconds until another code may be requested. */
    resend_after_seconds: z.number().int().nonnegative(),
    expires_in_seconds: z.number().int().positive(),
  })
  .strict();

export type OtpRequested = z.infer<typeof OtpRequestedSchema>;

export const VerifyOtpSchema = z
  .object({
    mobile: IndianMobileSchema,
    purpose: z.enum(OTP_PURPOSES),
    code: z
      .string()
      .trim()
      .regex(new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`), `must be exactly ${OTP_CODE_LENGTH} digits`),
  })
  .strict();

export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;

/**
 * Registration continues after a code is verified.
 *
 * `networth_category` is required here rather than at OTP time because it is a
 * schema foreign key: `User.networthCategory` is non-null, so a user row cannot
 * exist before a category is chosen. Requiring it later would mean a partial
 * user row, which section 36 forbids.
 */
export const CompleteRegistrationSchema = z
  .object({
    mobile: IndianMobileSchema,
    /** Net-worth band key from `net_worth_category_ref`, not a hardcoded enum. */
    networth_category: z.string().min(1).max(64),
  })
  .strict();

export type CompleteRegistrationInput = z.infer<typeof CompleteRegistrationSchema>;

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export const TokenPairSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    token_type: z.literal('Bearer'),
    expires_in: z.number().int().positive(),
  })
  .strict();

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

export const RefreshSchema = z.object({ refresh_token: z.string().min(1) }).strict();

/**
 * The authenticated user as the app sees it.
 *
 * Deliberately narrow. This is not a profile: no name, no contact details, no
 * net-worth figures. It carries only what the app needs to decide navigation
 * and gating — the next onboarding step, and which sections to show.
 */
export const CurrentUserSchema = z
  .object({
    id: z.string().min(1),
    mobile: z.string().min(1),
    status: z.enum([
      'PENDING_CATEGORY',
      'PENDING_VERIFICATION',
      'AWAITING_SETUP_FEE',
      'ACTIVE',
      'SUSPENDED',
      'DELETED',
    ]),
    networth_category: z.string().min(1),
    is_phone_verified: z.boolean(),
    identity_verified: z.boolean(),
    setup_fee_paid: z.boolean(),
    /** True only when status is ACTIVE: verified, paid, not suspended. */
    can_discover: z.boolean(),
    profile_complete: z.boolean(),
  })
  .strict();

export type CurrentUser = z.infer<typeof CurrentUserSchema>;
