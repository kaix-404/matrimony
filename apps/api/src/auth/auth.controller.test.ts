import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

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

  return {
    controller: new AuthController(
      otp as never,
      {} as never,
      {} as never,
      auth as never,
      {} as never,
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
    const controller = new AuthController(otp as never, {} as never, {} as never, {} as never, {} as never);

    await expect(
      controller.register({
        mobile: '9876543210',
        networth_category: 'TWO_CR_TO_FIVE_CR',
      } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
