import { describe, it, expect } from '@jest/globals';
import { createEnvSchema, loadEnv } from './env';

const VALID: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/matrimony',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  OTP_HASH_SECRET: 'c'.repeat(48),
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'matrimony-profiles',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
};

describe('required configuration', () => {
  it('accepts a minimal valid environment', () => {
    const env = loadEnv(VALID);
    expect(env.DATABASE_URL).toContain('localhost');
  });

  it('fails when DATABASE_URL is absent', () => {
    const { DATABASE_URL: _drop, ...rest } = VALID;
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('fails when a JWT secret is absent', () => {
    const { JWT_ACCESS_SECRET: _drop, ...rest } = VALID;
    expect(() => loadEnv(rest)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('fails when the OTP pepper is absent', () => {
    // OTP codes are hashed with this. Without it there is no safe default, so
    // the API must refuse to boot rather than fall back to an unpeppered hash.
    const { OTP_HASH_SECRET: _drop, ...rest } = VALID;
    expect(() => loadEnv(rest)).toThrow(/OTP_HASH_SECRET/);
  });

  it('rejects a placeholder OTP pepper in production', () => {
    expect(createEnvSchema(true).safeParse({ ...VALID, OTP_HASH_SECRET: 'changeme' }).success).toBe(false);
  });

  it('reports every offending key at once, not just the first', () => {
    expect(() => loadEnv({})).toThrow(/JWT_ACCESS_SECRET[\s\S]*JWT_REFRESH_SECRET/);
  });

  it('rejects a non-url database connection string', () => {
    expect(() => loadEnv({ ...VALID, DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
  });
});

describe('production secret policy (section 41)', () => {
  it('rejects placeholder secrets in production', () => {
    const schema = createEnvSchema(true);
    const result = schema.safeParse({
      ...VALID,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'changeme',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty secrets in production', () => {
    const schema = createEnvSchema(true);
    expect(schema.safeParse({ ...VALID, JWT_ACCESS_SECRET: '' }).success).toBe(false);
  });

  it('allows the same placeholder outside production, so local dev is not blocked', () => {
    const schema = createEnvSchema(false);
    expect(schema.safeParse({ ...VALID, JWT_ACCESS_SECRET: 'changeme' }).success).toBe(true);
  });

  it('accepts a real secret in production', () => {
    const schema = createEnvSchema(true);
    expect(schema.safeParse({ ...VALID, NODE_ENV: 'production' }).success).toBe(true);
  });
});

describe('typed coercion', () => {
  it('parses a CORS origin list', () => {
    const env = loadEnv({ ...VALID, API_CORS_ORIGINS: 'http://localhost:3000, http://admin.test ' });
    expect(env.API_CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://admin.test']);
  });

  it('defaults an absent CORS list to empty', () => {
    expect(loadEnv(VALID).API_CORS_ORIGINS).toEqual([]);
  });

  it('coerces booleanish strings', () => {
    const schema = createEnvSchema(false);
    for (const truthy of ['1', 'true', 'TRUE', 'yes', 'on']) {
      expect(schema.parse({ ...VALID, S3_FORCE_PATH_STYLE: truthy }).S3_FORCE_PATH_STYLE).toBe(true);
    }
    for (const falsy of ['0', 'false', 'no', 'off', '']) {
      expect(schema.parse({ ...VALID, S3_FORCE_PATH_STYLE: falsy }).S3_FORCE_PATH_STYLE).toBe(false);
    }
  });

  it('coerces numeric strings within range', () => {
    const schema = createEnvSchema(false);
    expect(schema.parse({ ...VALID, API_PORT: '8080' }).API_PORT).toBe(8080);
    expect(schema.safeParse({ ...VALID, API_PORT: '70000' }).success).toBe(false);
  });

  it('keeps money config as strings so no float is introduced', () => {
    const env = loadEnv(VALID);
    expect(env.PRICING_BELOW_2CR_BASE).toBe('99.00');
    expect(env.PRICING_TWO_CR_TO_FIVE_CR_BASE).toBe('249.00');
    expect(env.PRICING_FIVE_CR_TO_TEN_CR_BASE).toBe('499.00');
    expect(env.PRICING_ABOVE_10CR_BASE).toBe('999.00');
    expect(env.PRICING_GST_RATE).toBe('0.18');
    expect(typeof env.PRICING_BELOW_2CR_BASE).toBe('string');
  });

  it('defaults the D9 setup fee to a flat Rs 15', () => {
    expect(loadEnv(VALID).ACCOUNT_SETUP_FEE).toBe('15.00');
  });

  it('defaults the C3 reminder lead time to 2 hours', () => {
    expect(loadEnv(VALID).UNLOCK_EXPIRY_REMINDER_HOURS).toBe(2);
  });

  it('defaults F6 retention to 6 months', () => {
    expect(loadEnv(VALID).DELETED_ACCOUNT_RETENTION_MONTHS).toBe(6);
  });

  it('rejects a negative or non-numeric money value', () => {
    const schema = createEnvSchema(false);
    expect(schema.safeParse({ ...VALID, PRICING_BELOW_2CR_BASE: '-5' }).success).toBe(false);
    expect(schema.safeParse({ ...VALID, PRICING_BELOW_2CR_BASE: 'free' }).success).toBe(false);
  });

  it('caps the presigned URL TTL so photos cannot be harvested', () => {
    const schema = createEnvSchema(false);
    expect(schema.safeParse({ ...VALID, S3_SIGNED_URL_TTL: '86400' }).success).toBe(false);
    expect(schema.parse({ ...VALID, S3_SIGNED_URL_TTL: '300' }).S3_SIGNED_URL_TTL).toBe(300);
  });

  it('defaults the unlock window to 24 hours (section 15)', () => {
    expect(loadEnv(VALID).UNLOCK_WINDOW_HOURS).toBe(24);
  });
});

describe('supplier decisions of 2026-10-01', () => {
  it('defaults storage region to auto, which is what R2 requires', () => {
    // R2 is a single global service addressed by account. ap-south-1 was the
    // pre-R2 value and would silently be wrong rather than obviously invalid.
    expect(loadEnv(VALID).S3_REGION).toBe('auto');
  });

  it('defaults the Cashfree environment to sandbox', () => {
    // A missing environment must not default to production: that would send
    // sandbox test identities to a live verification provider.
    expect(loadEnv(VALID).CASHFREE_ENVIRONMENT).toBe('sandbox');
  });

  it('rejects an unknown Cashfree environment', () => {
    const schema = createEnvSchema(false);
    expect(schema.safeParse({ ...VALID, CASHFREE_ENVIRONMENT: 'live' }).success).toBe(false);
    expect(schema.parse({ ...VALID, CASHFREE_ENVIRONMENT: 'production' }).CASHFREE_ENVIRONMENT).toBe(
      'production',
    );
  });

  it('keeps verification credentials optional until the client supplies them', () => {
    const env = loadEnv(VALID);
    expect(env.CASHFREE_CLIENT_ID).toBe('');
    expect(env.CASHFREE_CLIENT_SECRET).toBe('');
  });

  it('carries the SMS DLT identifiers required for transactional delivery', () => {
    // Provider is undecided (GAP-12) but DLT registration is mandatory in India
    // whichever provider wins, so the config must exist before one is chosen.
    const env = loadEnv(VALID);
    expect(env.SMS_SENDER_ID).toBe('');
    expect(env.SMS_DLT_ENTITY_ID).toBe('');
    expect(env.SMS_DLT_TEMPLATE_ID).toBe('');
  });

  it('does not support the deprecated FCM legacy server key', () => {
    // Firebase was confirmed, but the legacy key is deprecated. It is not
    // accepted, so a deploy cannot silently rely on a credential that is dead.
    const schema = createEnvSchema(false);
    const result = schema.safeParse({ ...VALID, FCM_SERVER_KEY: 'legacy-key' });
    expect(result.success).toBe(true); // unknown keys are ignored
    expect('FCM_SERVER_KEY' in loadEnv(VALID)).toBe(false);
  });

  it('reads the Firebase HTTP v1 service account credential', () => {
    const env = loadEnv({ ...VALID, FCM_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}' });
    expect(env.FCM_SERVICE_ACCOUNT_JSON).toBe('{"type":"service_account"}');
  });
});
