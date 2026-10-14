/**
 * Stable date rendering for the dashboard.
 *
 * Timestamps are rendered in UTC so every administrator reads the same value
 * regardless of workstation timezone: two reviewers comparing notes on the same
 * report must not disagree about when it was filed by three hours.
 */

/** `YYYY-MM-DD HH:MM UTC`, or an em dash for a missing or unparseable value. */
export function formatDateTime(value: string | null | undefined): string {
  if (value === null || value === undefined || value.length === 0) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }
  return `${parsed.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** The `YYYY-MM-DD` part of a timestamp, or an em dash. */
export function formatDate(value: string | null | undefined): string {
  const formatted = formatDateTime(value);
  return formatted === '-' ? formatted : formatted.slice(0, 10);
}
