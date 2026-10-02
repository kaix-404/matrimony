/**
 * Environment configuration.
 *
 * Section 41: "Production secrets outside source code." This module parses and
 * validates the environment once at boot. A missing or malformed secret throws
 * immediately rather than failing later at the point of use, which is how weak
 * or default JWT secrets reach production.
 */

import { z } from 'zod';

/** Coerce "1" / "true" / "yes" to boolean; anything else is a hard error. */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()),
  );

const csv = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  );

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

/** Money-ish config, kept as strings so no float ever enters the system. */
const decimalString = z.string().regex(/^\d+(\.\d+)?$/, 'must be a non-negative decimal literal');

const production = process.env.NODE_ENV === 'production';

/**
 * Built by a factory so tests can exercise production-only rules without
 * mutating process.env.NODE_ENV for the whole process.
 */
export function createEnvSchema(isProduction: boolean) {
  /**
   * A signing secret that is present but obviously a placeholder is treated as
   * a hard failure in production, and allowed elsewhere.
   */
  const signingSecret = (name: string) =>
    z
      .string()
      .min(1, `${name} must be set`)
      .superRefine((value, ctx) => {
        if (isProduction && /^(changeme|placeholder|secret|your-|<.*>)/i.test(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${name} still holds a placeholder value in production`,
          });
        }
      });

  return z.object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    API_PORT: int(1, 65_535).default(4000),
    API_GLOBAL_PREFIX: z.string().default('api/v1'),
    API_CORS_ORIGINS: csv,

    // -- auth (section 41) -------------------------------------------------
    JWT_ACCESS_SECRET: signingSecret('JWT_ACCESS_SECRET'),
    JWT_REFRESH_SECRET: signingSecret('JWT_REFRESH_SECRET'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),

    // -- data --------------------------------------------------------------
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().default('redis://localhost:6379'),

    // -- object storage (section 41) --------------------------------------
    // Cloudflare R2 in production (client decision 2026-10-01). R2 speaks the S3
    // API, so the client code is provider-agnostic; MinIO serves locally.
    //
    // NOTE: R2 has no India jurisdiction — only eu/us/fedramp — so its "apac"
    // region is a best-effort location hint. That conflicts with H3
    // (India-only residency). Tracked as GAP-11 in
    // docs/decisions/client-provider-decisions-2026-10-01.md.
    S3_ENDPOINT: z.string().url(),
    /** R2 is a single global service addressed by account, so "auto" is literal. */
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: booleanish.default(true),
    /** Short by design: presigned photo URLs must not be scrapeable (section 41). */
    S3_SIGNED_URL_TTL: int(30, 3600).default(300),

    // -- payments (section 14) --------------------------------------------
    RAZORPAY_KEY_ID: z.string().default(''),
    RAZORPAY_KEY_SECRET: z.string().default(''),
    RAZORPAY_WEBHOOK_SECRET: z.string().default(''),

    // -- identity verification (D9, client decision 2026-10-01) ----------
    // Cashfree Secure ID. Use the DigiLocker flow: consent-based, returns an
    // already-masked Aadhaar, and retains no document. We never store a raw
    // Aadhaar number, so the schema has no column able to hold one.
    CASHFREE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
    CASHFREE_CLIENT_ID: z.string().default(''),
    CASHFREE_CLIENT_SECRET: z.string().default(''),

    // -- notifications (section 42) ---------------------------------------
    // Firebase HTTP v1. The legacy FCM server key is deliberately not supported:
    // it is deprecated, and quietly keeping it would let a deploy ship against a
    // credential that no longer works.
    FCM_SERVICE_ACCOUNT_JSON: z.string().default(''),
    // SMS and email providers are undecided (GAP-12); MSG91 is the fallback, so
    // the config stays provider-agnostic until the client settles it. The DLT
    // identifiers are required for transactional SMS in India regardless of
    // which provider wins, which is why they are configured here.
    SMS_PROVIDER_API_KEY: z.string().default(''),
    SMS_SENDER_ID: z.string().default(''),
    SMS_DLT_ENTITY_ID: z.string().default(''),
    SMS_DLT_TEMPLATE_ID: z.string().default(''),
    EMAIL_PROVIDER_API_KEY: z.string().default(''),
    EMAIL_FROM_ADDRESS: z.string().default(''),

    // -- rate limiting / OTP (section 6) ----------------------------------
    RATE_LIMIT_TTL: int(1, 3600).default(60),
    RATE_LIMIT_MAX: int(1, 10_000).default(100),
    /**
     * Peppers the OTP hash. A dedicated secret rather than borrowing a JWT one:
     * it can be rotated independently of the tokens, and leaking one does not
     * compromise the other. Rotating it invalidates every outstanding code,
     * which is the correct failure mode — old codes were hashed under the old
     * pepper.
     */
    OTP_HASH_SECRET: signingSecret('OTP_HASH_SECRET'),
    OTP_MAX_ATTEMPTS: int(1, 20).default(5),
    OTP_RESEND_COOLDOWN_SECONDS: int(1, 900).default(60),
    OTP_TTL_SECONDS: int(30, 3600).default(300),

    // -- domain rules (client schedule confirmed 2026-09-29) -------------
    // Bootstrap defaults only. The database is authoritative for bands and
    // prices; these exist so a fresh install has a coherent starting point.
    PRICING_BELOW_2CR_BASE: decimalString.default('99.00'),
    PRICING_TWO_CR_TO_FIVE_CR_BASE: decimalString.default('249.00'),
    PRICING_FIVE_CR_TO_TEN_CR_BASE: decimalString.default('499.00'),
    PRICING_ABOVE_10CR_BASE: decimalString.default('999.00'),
    PRICING_GST_RATE: decimalString.default('0.18'),
    /** D9: flat account setup fee. No separate GST. */
    ACCOUNT_SETUP_FEE: decimalString.default('15.00'),
    /** C3: reminder lead time before an unlock expires. */
    UNLOCK_EXPIRY_REMINDER_HOURS: int(1, 48).default(2),
    /** F6: retention before a deleted account is irreversibly erased. */
    DELETED_ACCOUNT_RETENTION_MONTHS: int(1, 120).default(6),
    UNLOCK_WINDOW_HOURS: int(1, 168).default(24),
  });
}

export const envSchema = createEnvSchema(production);

export type Env = z.infer<typeof envSchema>;

/** Parse a raw environment, e.g. from process.env or a test fixture. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Fail loudly at boot with every offending key listed; a single generic
    // error sends operators hunting one variable at a time.
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }
  return parsed.data;
}
