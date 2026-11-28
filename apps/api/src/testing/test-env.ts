/**
 * The environment a suite hands to a booted `AppModule`.
 *
 * Throwaway values that exist only to satisfy `loadEnv`'s required-field checks:
 * nothing here reaches a real service, and no provider credential is set, which
 * is why `sms` is legitimately unconfigured at boot.
 *
 * Shared rather than copied per suite, because the suites that boot the whole
 * graph have to agree on what "boots" means. `app.boot.test.ts` proves the graph
 * starts and `provider-readiness.boot.test.ts` proves what it logs while
 * starting; a key present in one copy but not the other would have the two
 * making different claims about the same deployment. A suite that boots a slice
 * of the graph — `app.rate-limit.test.ts` — still declares its own minimal
 * environment.
 *
 * The TTLs are here for a reason worth keeping: `AuthModule` parses the access
 * TTL at wiring time to configure the JWT signer, so a missing value is a
 * construction failure rather than a runtime one. `S3_CORS_ORIGINS` is empty
 * because that leaves the bucket's rules alone while still exercising the
 * service's construction.
 */
export const TEST_ENV = {
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'test-access-secret-not-used-for-signing',
  JWT_REFRESH_SECRET: 'test-refresh-secret-not-used-for-signing',
  MFA_ENCRYPTION_KEY: 'test-mfa-key-not-used-to-encrypt-anything',
  OTP_HASH_SECRET: 'test-otp-pepper-not-used-for-hashing',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'test-bucket',
  S3_ACCESS_KEY: 'test-access-key',
  S3_SECRET_KEY: 'test-secret-key',
  S3_CORS_ORIGINS: '',
  API_GLOBAL_PREFIX: 'api',
  API_CORS_ORIGINS: [],
  RATE_LIMIT_TTL: 60,
  RATE_LIMIT_MAX: 100,
} as const;
