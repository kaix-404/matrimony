import { formatDate, formatDateTime } from './format';

describe('formatDateTime', () => {
  it('renders a timestamp in UTC to the minute', () => {
    expect(formatDateTime('2026-10-14T19:07:05.123Z')).toBe('2026-10-14 19:07 UTC');
  });

  it('renders a missing value as an em dash', () => {
    expect(formatDateTime(null)).toBe('-');
    expect(formatDateTime(undefined)).toBe('-');
    expect(formatDateTime('')).toBe('-');
  });

  it('renders an unparseable value as an em dash', () => {
    expect(formatDateTime('not a date')).toBe('-');
  });
});

describe('formatDate', () => {
  it('keeps only the date part', () => {
    expect(formatDate('2026-10-14T19:07:05Z')).toBe('2026-10-14');
  });

  it('passes the em dash through', () => {
    expect(formatDate(null)).toBe('-');
  });
});
