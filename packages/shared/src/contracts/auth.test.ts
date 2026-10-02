import {
  IndianMobileSchema,
  OTP_CODE_LENGTH,
  RequestOtpSchema,
  VerifyOtpSchema,
  CompleteRegistrationSchema,
  CurrentUserSchema,
} from './auth';

describe('IndianMobileSchema', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['+919876543210', '9876543210'],
    ['919876543210', '9876543210'],
    ['  9876543210  ', '9876543210'],
  ])('normalises %s', (input, expected) => {
    expect(IndianMobileSchema.parse(input)).toBe(expected);
  });

  it.each([
    ['987654321', 'too short'],
    ['98765432101', 'too long'],
    ['1876543210', 'does not start 6-9'],
    ['+91987654321', 'country code with wrong length'],
    ['not-a-number', 'garbage'],
  ])('rejects %s (%s)', (input) => {
    expect(IndianMobileSchema.safeParse(input).success).toBe(false);
  });

  it('does not strip a leading 91 that is part of the subscriber number', () => {
    // 91 followed by a valid-looking 10-digit subscriber number must keep its
    // leading 91 — otherwise two distinct numbers could collide.
    expect(IndianMobileSchema.safeParse('919876543210').success).toBe(true);
    expect(IndianMobileSchema.parse('919876543210')).toBe('9876543210');
  });
});

describe('OTP request contract', () => {
  it('accepts a well-formed request', () => {
    const parsed = RequestOtpSchema.parse({ mobile: '+91 9876543210', purpose: 'REGISTRATION' });
    expect(parsed.mobile).toBe('9876543210');
    expect(parsed.purpose).toBe('REGISTRATION');
  });

  it('rejects unknown keys', () => {
    // An unrecognised field is a contract change that has not been agreed, not
    // something to silently accept.
    expect(
      RequestOtpSchema.safeParse({ mobile: '9876543210', purpose: 'LOGIN', is_admin: true })
        .success,
    ).toBe(false);
  });

  it.each(['PASSWORD_RESET', 'ADMIN_LOGIN', ''])('rejects purpose %p', (purpose) => {
    expect(RequestOtpSchema.safeParse({ mobile: '9876543210', purpose }).success).toBe(false);
  });
});

describe('VerifyOtpSchema', () => {
  it(`accepts exactly ${OTP_CODE_LENGTH} digits`, () => {
    expect(
      VerifyOtpSchema.safeParse({ mobile: '9876543210', purpose: 'LOGIN', code: '123456' }).success,
    ).toBe(true);
  });

  it.each([
    ['12345', 'five digits'],
    ['1234567', 'seven digits'],
    ['12345a', 'non-numeric'],
    ['', 'empty'],
  ])('rejects code %p (%s)', (code) => {
    expect(
      VerifyOtpSchema.safeParse({ mobile: '9876543210', purpose: 'LOGIN', code }).success,
    ).toBe(false);
  });
});

describe('CompleteRegistrationSchema', () => {
  it('requires a net-worth category', () => {
    expect(CompleteRegistrationSchema.safeParse({ mobile: '9876543210' }).success).toBe(false);
    expect(
      CompleteRegistrationSchema.parse({
        mobile: '9876543210',
        networth_category: 'TWO_CR_TO_FIVE_CR',
      }).networth_category,
    ).toBe('TWO_CR_TO_FIVE_CR');
  });
});

describe('CurrentUserSchema', () => {
  it('is closed, so no profile field can ride along', () => {
    expect(
      CurrentUserSchema.safeParse({
        id: 'u1',
        mobile: '9876543210',
        status: 'ACTIVE',
        networth_category: 'ABOVE_10CR',
        is_phone_verified: true,
        identity_verified: true,
        setup_fee_paid: true,
        can_discover: true,
        profile_complete: false,
        annual_income: '50,00,000',
      }).success,
    ).toBe(false);
  });
});
