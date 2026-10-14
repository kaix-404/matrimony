import { ApiError, describeError, extractMessage, isSessionExpired } from './errors';

describe('extractMessage', () => {
  it('reads a Nest string message', () => {
    expect(extractMessage({ statusCode: 409, message: 'Report is already resolved' })).toBe(
      'Report is already resolved',
    );
  });

  it('joins an array of validation messages', () => {
    expect(extractMessage({ message: ['a', 'b'] })).toBe('a; b');
  });

  it('accepts a bare string body', () => {
    expect(extractMessage('plain failure')).toBe('plain failure');
  });

  it('returns null when there is no usable message', () => {
    expect(extractMessage(undefined)).toBeNull();
    expect(extractMessage({})).toBeNull();
    expect(extractMessage({ message: [] })).toBeNull();
  });
});

describe('describeError', () => {
  it('returns an ApiError message', () => {
    expect(describeError(new ApiError(500, 'boom'))).toBe('boom');
  });

  it('returns a generic message for an unknown thrown value', () => {
    expect(describeError('nope')).toBe('Something went wrong.');
  });
});

describe('isSessionExpired', () => {
  it('is true only for a 401 ApiError', () => {
    expect(isSessionExpired(new ApiError(401, 'unauthorized'))).toBe(true);
    expect(isSessionExpired(new ApiError(403, 'forbidden'))).toBe(false);
    expect(isSessionExpired(new Error('x'))).toBe(false);
  });
});
