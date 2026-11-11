import {
  ChangeEmailSchema,
  EMAIL_UNAVAILABLE_CODE,
  EmailAddressSchema,
  OTP_PURPOSES,
  RequestEmailOtpSchema,
} from './auth.js';

/**
 * The email contract for a verified address change.
 *
 * The properties asserted here are the ones that keep two accounts from claiming
 * one mailbox and keep a code from being spent on a different address than the
 * one it was sent to: normalisation happens in the contract, so every caller
 * stores the same form, and both schemas are strict so a client cannot smuggle an
 * extra field past the API.
 */

describe('OTP_PURPOSES', () => {
  it('carries its own purpose for an address change', () => {
    expect(OTP_PURPOSES).toContain('CHANGE_EMAIL');
    // The number and address purposes must stay distinct: a code sent to a
    // mailbox is not a sign-in and not a way to move the login number.
    expect(OTP_PURPOSES).toContain('CHANGE_MOBILE');
    expect(OTP_PURPOSES.indexOf('CHANGE_EMAIL')).not.toBe(OTP_PURPOSES.indexOf('CHANGE_MOBILE'));
  });
});

describe('EmailAddressSchema', () => {
  it('trims and lower-cases so one mailbox cannot become two accounts', () => {
    expect(EmailAddressSchema.parse('  Alice@Example.COM ')).toBe('alice@example.com');
  });

  it('refuses something that is not an address', () => {
    for (const input of ['', 'alice', 'alice@', '@example.com', 'alice@example']) {
      expect(EmailAddressSchema.safeParse(input).success).toBe(false);
    }
  });

  it('refuses an address past the practical length limit', () => {
    const tooLong = `${'a'.repeat(250)}@example.com`;
    expect(EmailAddressSchema.safeParse(tooLong).success).toBe(false);
  });
});

describe('ChangeEmailSchema', () => {
  it('normalises the address and requires a six-digit code', () => {
    const parsed = ChangeEmailSchema.parse({ email: 'Alice@Example.com', code: '123456' });
    expect(parsed.email).toBe('alice@example.com');

    expect(ChangeEmailSchema.safeParse({ email: 'a@b.com', code: '12345' }).success).toBe(false);
    expect(ChangeEmailSchema.safeParse({ email: 'a@b.com', code: '12345a' }).success).toBe(false);
  });

  it('refuses an extra field rather than ignoring it', () => {
    expect(
      ChangeEmailSchema.safeParse({ email: 'a@b.com', code: '123456', user_id: 'x' }).success,
    ).toBe(false);
  });
});

describe('RequestEmailOtpSchema', () => {
  it('accepts only an address: the account comes from the token', () => {
    expect(RequestEmailOtpSchema.parse({ email: ' A@B.com ' })).toEqual({ email: 'a@b.com' });
    expect(RequestEmailOtpSchema.safeParse({ email: 'a@b.com', user_id: 'other' }).success).toBe(
      false,
    );
  });
});

describe('EMAIL_UNAVAILABLE_CODE', () => {
  it('is a stable code the app can recognise', () => {
    expect(EMAIL_UNAVAILABLE_CODE).toBe('EMAIL_UNAVAILABLE');
  });
});
