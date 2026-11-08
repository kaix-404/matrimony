import {
  CreateDataRequestSchema,
  DataRequestListResponseSchema,
  DataRequestSchema,
} from './data-requests.js';

/**
 * Data request contract tests — section 21.
 *
 * Two properties are worth pinning. The request type is not a member choice, so
 * an erasure sent to the export endpoint must be refused rather than booked as
 * the wrong thing; and the member's view must stay in the app's snake_case and
 * without the internal columns (`user_id`, `handled_by_admin_id`) that the admin
 * view carries.
 */

function view(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dr_1',
    type: 'EXPORT',
    status: 'REQUESTED',
    requested_at: '2026-01-01T00:00:00.000Z',
    due_at: '2026-01-31T00:00:00.000Z',
    completed_at: null,
    resolution_notes: null,
    ...overrides,
  };
}

describe('CreateDataRequestSchema', () => {
  it('accepts an export request', () => {
    expect(CreateDataRequestSchema.parse({ type: 'EXPORT' })).toEqual({ type: 'EXPORT' });
  });

  it('refuses erasure, which is a different flow', () => {
    expect(CreateDataRequestSchema.safeParse({ type: 'ERASURE' }).success).toBe(false);
  });

  it('refuses an extra field', () => {
    expect(CreateDataRequestSchema.safeParse({ type: 'EXPORT', user_id: 'u2' }).success).toBe(
      false,
    );
  });
});

describe('DataRequestSchema', () => {
  it('parses the member view', () => {
    expect(DataRequestSchema.parse(view()).due_at).toBe('2026-01-31T00:00:00.000Z');
  });

  it('carries the reason a request was refused', () => {
    const parsed = DataRequestSchema.parse(
      view({ status: 'REJECTED', resolution_notes: 'Nothing held' }),
    );
    expect(parsed.resolution_notes).toBe('Nothing held');
  });

  it('does not expose the admin-side columns', () => {
    expect(DataRequestSchema.safeParse(view({ user_id: 'u1' })).success).toBe(false);
    expect(DataRequestSchema.safeParse(view({ handled_by_admin_id: 'admin_1' })).success).toBe(
      false,
    );
  });

  it('refuses an unknown status', () => {
    expect(DataRequestSchema.safeParse(view({ status: 'PENDING' })).success).toBe(false);
  });
});

describe('DataRequestListResponseSchema', () => {
  it('accepts an empty list', () => {
    expect(DataRequestListResponseSchema.parse({ requests: [] })).toEqual({ requests: [] });
  });

  it('refuses a bare array, which is what an unwrapped response would be', () => {
    expect(DataRequestListResponseSchema.safeParse([view()]).success).toBe(false);
  });
});
