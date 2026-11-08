import { readParam } from './query';

/**
 * The list screens are only as correct as the query string they read: a second
 * `status` value or an empty `cursor` sent by an empty form field decides which
 * rows an operator sees.
 */
describe('readParam', () => {
  it('returns a single value', () => {
    expect(readParam({ status: 'OPEN' }, 'status')).toBe('OPEN');
  });

  it('returns undefined for a parameter the request did not carry', () => {
    expect(readParam({}, 'cursor')).toBeUndefined();
  });

  it('takes the first of a repeated parameter, so a list cannot match neither', () => {
    expect(readParam({ status: ['OPEN', 'COMPLETED'] }, 'status')).toBe('OPEN');
  });

  it('treats an empty value as absent, because an empty form field sends one', () => {
    expect(readParam({ cursor: '' }, 'cursor')).toBeUndefined();
    expect(readParam({ cursor: [''] }, 'cursor')).toBeUndefined();
  });

  it('keeps a value that only looks numeric, such as a cursor id', () => {
    expect(readParam({ cursor: 'user_abc123' }, 'cursor')).toBe('user_abc123');
  });
});
