import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { SMS_UNAVAILABLE_CODE } from '@matrimony/shared';
import { AuthController } from './auth.controller';
import { SmsCreditExhaustedError } from '../sms/sms.gateway';

/**
 * OTP verification routing — the branch that decides which purpose signs in.
 *
 * Two of the four purposes are steps in a flow rather than sign-ins, and the
 * difference is invisible in the response unless a test pins it. The
 * DELETE_ACCOUNT branch is the one that matters most: before section 21 it did
 * not exist, so a re-authentication code was consumed by `/otp/verify` and
 * sign-in was attempted for an account whose next request deletes it. The
 * caller would have arrived at the deletion endpoint with no code left to
 * spend — a 401 on the one endpoint the flow exists for.
 */

interface Fixture {
  controller: AuthController;
  consume: jest.Mock;
  signIn: jest.Mock;
  recordFailure: jest.Mock;
  verifyOtp: jest.Mock;
}

function makeController(
  opts: { verified?: boolean; signInResult?: unknown } = {},
): Fixture {
  const consume = jest.fn().mockResolvedValue(true);
  const signIn = jest.fn().mockResolvedValue(opts.signInResult ?? null);
  const recordFailure = jest.fn().mockResolvedValue(undefined);
  const verifyOtp = jest.fn().mockResolvedValue(opts.verified ?? true);

  const otp = { verify: verifyOtp, consumeVerified: consume };
  const auth = { signIn, recordFailedSignInForMobile: recordFailure };

  const sms = { configured: true, sendOtp: jest.fn().mockResolvedValue({ providerMessageId: null }) };
  return {
    controller: new AuthController(
      otp as never,
      {} as never,
      {} as never,
      auth as never,
      {} as never,
      sms as never,
    ),
    consume,
    signIn,
    recordFailure,
    verifyOtp,
  };
}

const code = (purpose: string) => ({ mobile: '9876543210', code: '123456', purpose });

describe('AuthController.verifyOtp', () => {
  it('spends the code and signs in for an ordinary sign-in', async () => {
    const { controller, consume, signIn } = makeController({
      signInResult: { access_token: 'a' },
    });

    const result = await controller.verifyOtp(code('LOGIN') as never);

    expect(consume).toHaveBeenCalledWith({ mobile: '9876543210', purpose: 'LOGIN' });
    expect(signIn).toHaveBeenCalledWith('9876543210');
    expect(result.verified).toBe(true);
    expect(result.tokens).toEqual({ access_token: 'a' });
  });

  it('returns verified without tokens when the number has no account', async () => {
    const { controller, signIn } = makeController({ signInResult: null });

    const result = await controller.verifyOtp(code('LOGIN') as never);

    // The response must not distinguish "wrong number" from "no account", so
    // this cannot be used to enumerate users.
    expect(signIn).toHaveBeenCalled();
    expect(result).toEqual({ verified: true });
  });

  it('leaves the registration code unspent for /auth/register to consume', async () => {
    const { controller, consume, signIn } = makeController();

    const result = await controller.verifyOtp(code('REGISTRATION') as never);

    expect(result).toEqual({ verified: true, registration_required: true });
    expect(consume).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('leaves the deletion code unspent and refuses to sign in', async () => {
    const { controller, consume, signIn } = makeController();

    const result = await controller.verifyOtp(code('DELETE_ACCOUNT') as never);

    // The regression this branch exists to prevent. Spending the code here
    // means AccountDeletionService finds nothing to consume and answers 401 to
    // a caller who did everything right; signing in would mint a session for
    // an account whose very next request deletes it.
    expect(result).toEqual({ verified: true });
    expect(result).not.toHaveProperty('tokens');
    expect(consume).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('records the failure but never spends or signs in on a wrong code', async () => {
    const { controller, consume, signIn, recordFailure } = makeController({ verified: false });

    const result = await controller.verifyOtp(code('DELETE_ACCOUNT') as never);

    expect(result).toEqual({ verified: false });
    expect(consume).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
    // Counted, because a wrong code against a delete endpoint is somebody
    // working through the six digits, and leaving it uncounted would make the
    // re-authentication step a free oracle.
    expect(recordFailure).toHaveBeenCalledWith('9876543210');
  });

  it('does not count a failed registration code as a failed sign-in', async () => {
    const { controller, recordFailure } = makeController({ verified: false });

    await controller.verifyOtp(code('REGISTRATION') as never);

    // Otherwise anyone could lock a number out of ever registering by sending
    // bad codes to it.
    expect(recordFailure).not.toHaveBeenCalled();
  });
});

describe('AuthController.register', () => {
  it('refuses when no registration code was spent', async () => {
    const otp = { consumeVerified: jest.fn().mockResolvedValue(false) };
    const controller = new AuthController(
      otp as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { configured: true, sendOtp: jest.fn() } as never,
    );

    await expect(
      controller.register({
        mobile: '9876543210',
        networth_category: 'TWO_CR_TO_FIVE_CR',
      } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

/**
 * Which of the three delivery branches runs.
 *
 * The branch used to key off NODE_ENV alone, so development never touched the
 * provider and a local run could not tell a wired-up gateway from an empty one.
 * Delivery is now decided by whether MSG91 is configured, and NODE_ENV only
 * decides whether the escape hatches exist: development may echo the code when
 * a gateway is missing or rejects the send, production may do neither. Those
 * two rules are invisible in the response unless a test pins each combination.
 */
describe('AuthController.requestOtp', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const body = { mobile: '9876543210', purpose: 'REGISTRATION' };

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  function makeRequestOtpController(opts: { configured?: boolean } = {}) {
    const sendOtp = jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' });
    const otp = {
      assertNotCoolingDown: jest.fn().mockResolvedValue(undefined),
      issue: jest.fn().mockResolvedValue({
        id: 'otp-1',
        code: '434578',
        resendAfterAt: new Date('2026-10-25T12:01:00Z'),
        expiresAt: new Date('2026-10-25T12:06:00Z'),
      }),
      cooldownSeconds: 60,
      ttlSeconds: 300,
    };

    const controller = new AuthController(
      otp as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { configured: opts.configured ?? true, sendOtp } as never,
    );

    return { controller, sendOtp };
  }

  it('sends through MSG91 when the gateway is configured, without echoing the code', async () => {
    process.env.NODE_ENV = 'development';
    const { controller, sendOtp } = makeRequestOtpController({ configured: true });

    const result = await controller.requestOtp(body as never);

    expect(sendOtp).toHaveBeenCalledWith({ mobile: '9876543210', code: '434578' });
    expect(result.dev_code).toBeUndefined();
  });

  it('echoes the code in development when no gateway is configured', async () => {
    process.env.NODE_ENV = 'development';
    const { controller, sendOtp } = makeRequestOtpController({ configured: false });

    const result = await controller.requestOtp(body as never);

    expect(sendOtp).not.toHaveBeenCalled();
    expect(result.dev_code).toBe('434578');
  });

  it('echoes the code when the provider rejects the send in development', async () => {
    process.env.NODE_ENV = 'development';
    const { controller, sendOtp } = makeRequestOtpController({ configured: true });
    sendOtp.mockRejectedValue(new Error('MSG91 rejected the send (HTTP 400)'));

    const result = await controller.requestOtp(body as never);

    expect(result.dev_code).toBe('434578');
  });

  it('fails closed in production when no gateway is configured', async () => {
    process.env.NODE_ENV = 'production';
    const { controller, sendOtp } = makeRequestOtpController({ configured: false });

    await expect(controller.requestOtp(body as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it('surfaces a rejected send in production rather than echoing the code', async () => {
    process.env.NODE_ENV = 'production';
    const { controller, sendOtp } = makeRequestOtpController({ configured: true });
    sendOtp.mockRejectedValue(new Error('MSG91 rejected the send (HTTP 400)'));

    await expect(controller.requestOtp(body as never)).rejects.toThrow(
      'MSG91 rejected the send',
    );
  });

  it('answers an unfunded wallet with a coded 503 rather than a generic failure', async () => {
    process.env.NODE_ENV = 'production';
    const { controller, sendOtp } = makeRequestOtpController({ configured: true });
    sendOtp.mockRejectedValue(new SmsCreditExhaustedError('MSG91 has no SMS credit'));

    // The app can only show copy a person can act on if it can tell this
    // refusal from an outage, so the code is the contract here.
    const error = (await controller.requestOtp(body as never).catch((e: unknown) => e)) as
      | ServiceUnavailableException
      | undefined;
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error?.getResponse()).toMatchObject({
      code: SMS_UNAVAILABLE_CODE,
      statusCode: 503,
    });
  });

  it('keeps the vendor diagnostic out of what an unfunded production caller is told', async () => {
    process.env.NODE_ENV = 'production';
    const { controller, sendOtp } = makeRequestOtpController({ configured: true });
    sendOtp.mockRejectedValue(
      new SmsCreditExhaustedError('MSG91 has no SMS credit on the transactional route'),
    );

    const error = (await controller.requestOtp(body as never).catch((e: unknown) => e)) as
      | ServiceUnavailableException
      | undefined;
    const response = JSON.stringify(error?.getResponse() ?? {});

    // "Recharge the MSG91 wallet" is for an operator reading logs, not for a
    // stranger's phone screen.
    expect(response).not.toMatch(/MSG91|credit|wallet|recharge/i);
  });

  it('echoes the code in development with a warning when the wallet is empty', async () => {
    process.env.NODE_ENV = 'development';
    const { controller, sendOtp } = makeRequestOtpController({ configured: true });
    sendOtp.mockRejectedValue(new SmsCreditExhaustedError('MSG91 has no SMS credit'));

    const result = await controller.requestOtp(body as never);

    // The code is echoed so the developer is not stuck; the warning is what
    // stops that echo from looking like a delivered SMS — the exact blind spot
    // that let an empty wallet stay invisible.
    expect(result.dev_code).toBe('434578');
    expect(result.delivery_warning).toMatch(/no message was sent/i);
  });

  it('adds no delivery warning when the send succeeded', async () => {
    process.env.NODE_ENV = 'development';
    const { controller } = makeRequestOtpController({ configured: true });

    const result = await controller.requestOtp(body as never);

    expect(result.delivery_warning).toBeUndefined();
  });

  it('adds no delivery warning for an ordinary provider rejection in development', async () => {
    process.env.NODE_ENV = 'development';
    const { controller, sendOtp } = makeRequestOtpController({ configured: true });
    sendOtp.mockRejectedValue(new Error('MSG91 rejected the send (HTTP 400)'));

    const result = await controller.requestOtp(body as never);

    expect(result.delivery_warning).toBeUndefined();
  });
});
