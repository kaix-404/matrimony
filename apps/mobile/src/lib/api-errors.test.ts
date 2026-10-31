import { ApiError, describeOtpSendFailure, parseApiErrorBody } from './api-errors';

/**
 * How an OTP that was not sent reaches the user.
 *
 * The screen used to print whatever the client threw, so an undeliverable code
 * arrived as `API 503: {"statusCode":503,...}` — a wall of JSON that suggests
 * the user did something wrong when in fact nothing they can change will help.
 * These tests pin the two halves of the fix: the error body is parsed into a
 * typed error, and the one cause we can name gets copy written for a phone.
 */

function apiError(status: number, code: string | null, message = 'nope'): ApiError {
  return new ApiError(status, message, code);
}

describe('parseApiErrorBody', () => {
  it('reads the message and code out of a Nest error body', () => {
    expect(
      parseApiErrorBody(
        JSON.stringify({ statusCode: 503, code: 'SMS_UNAVAILABLE', message: 'unavailable' }),
      ),
    ).toEqual({ message: 'unavailable', code: 'SMS_UNAVAILABLE' });
  });

  it('joins the validation messages Nest returns as a list', () => {
    expect(
      parseApiErrorBody(JSON.stringify({ statusCode: 400, message: ['mobile bad', 'purpose bad'] }))
        .message,
    ).toBe('mobile bad; purpose bad');
  });

  it('leaves the code null when the API sent none', () => {
    expect(parseApiErrorBody(JSON.stringify({ statusCode: 400, message: 'bad' })).code).toBeNull();
  });

  it('keeps a non-JSON body, such as a proxy error page, as a short excerpt', () => {
    const { message, code } = parseApiErrorBody('  <html>502 Bad Gateway</html>  ');

    expect(message).toBe('<html>502 Bad Gateway</html>');
    expect(code).toBeNull();
  });

  it('returns nothing for a body that is not even text', () => {
    expect(parseApiErrorBody('')).toEqual({ message: null, code: null });
  });
});

describe('describeOtpSendFailure', () => {
  it('explains an undeliverable code in words a user can act on', () => {
    const message = describeOtpSendFailure(apiError(503, 'SMS_UNAVAILABLE'));

    expect(message).toMatch(/could not text your code/i);
    expect(message).toMatch(/try again/i);
  });

  it('never repeats the operator diagnostic on the user screen', () => {
    // The API's own wording names the vendor; that belongs in logs.
    const message = describeOtpSendFailure(
      apiError(503, 'SMS_UNAVAILABLE', 'Recharge the MSG91 wallet.'),
    );

    expect(message).not.toMatch(/MSG91|credit|wallet|recharge/i);
  });

  it('falls back to the API message for any other coded failure', () => {
    expect(describeOtpSendFailure(apiError(429, 'RATE_LIMITED', 'Too many requests'))).toBe(
      'Too many requests',
    );
  });

  it('does not mistake a same-message error from another status for the SMS refusal', () => {
    expect(describeOtpSendFailure(apiError(500, null, 'Internal server error'))).toBe(
      'Internal server error',
    );
  });

  it('uses the thrown message when a plain Error escapes the client', () => {
    expect(describeOtpSendFailure(new Error('Network request failed'))).toBe(
      'Network request failed',
    );
  });

  it('has a last resort for something that is not an Error at all', () => {
    expect(describeOtpSendFailure({ weird: true })).toBe('Could not send the code.');
  });
});
