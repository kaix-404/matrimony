import {
  BlockedListResponseSchema,
  BlockProfileSchema,
  BlockedProfileSchema,
  CreateReportSchema,
  ReportReasonListResponseSchema,
  ReportReasonSchema,
  ReportSummarySchema,
} from './trust-safety.js';

/**
 * Trust and safety contract tests — sections 19, 20, 21.
 *
 * These assert two properties that a reader of the endpoint could easily assume
 * and that would be wrong without them. Every contract here is `.strict()`,
 * because a moderation endpoint is where an accepted-but-unexpected field does
 * the most damage: client and server would disagree about what was recorded.
 * And neither the blocked list nor the report summary may carry a name or any
 * part of the review — those are disclosure rules from sections 12, 13 and 30,
 * not accidents of shape.
 */

describe('BlockProfileSchema', () => {
  it('takes a profile id and nothing else', () => {
    expect(BlockProfileSchema.parse({ profile_id: 'p1' })).toEqual({ profile_id: 'p1' });
    expect(BlockProfileSchema.safeParse({ profile_id: 'p1', user_id: 'u1' }).success).toBe(false);
  });

  it('refuses an empty target', () => {
    expect(BlockProfileSchema.safeParse({ profile_id: '' }).success).toBe(false);
    expect(BlockProfileSchema.safeParse({}).success).toBe(false);
  });
});

describe('BlockedProfileSchema', () => {
  const entry = { profile_id: 'p1', photo: null, blocked_at: '2026-10-06T12:00:00.000Z' };

  it('exposes exactly the three fields, so no name can ride along', () => {
    // Section 13 withholds the name until payment and the discovery card never
    // carried one, so a blocked list entry showing it would hand the caller a
    // field they have never been entitled to. Blocked is not unlocked.
    expect(Object.keys(BlockedProfileSchema.parse(entry)).sort()).toEqual([
      'blocked_at',
      'photo',
      'profile_id',
    ]);

    expect(BlockedProfileSchema.safeParse({ ...entry, first_name: 'A' }).success).toBe(false);
    expect(BlockedProfileSchema.safeParse({ ...entry, name: 'A' }).success).toBe(false);
    expect(BlockedProfileSchema.safeParse({ ...entry, display_name: 'A' }).success).toBe(false);
    expect(BlockedProfileSchema.safeParse({ ...entry, mobile: '9876543210' }).success).toBe(false);
  });

  it('requires a timestamp', () => {
    expect(BlockedProfileSchema.safeParse({ profile_id: 'p1', photo: null }).success).toBe(false);
    expect(BlockedProfileSchema.safeParse({ ...entry, blocked_at: 'yesterday' }).success).toBe(false);
  });

  it('allows the photo to be absent, since a signing failure still shows the row', () => {
    expect(BlockedProfileSchema.parse(entry).photo).toBeNull();
  });
});

describe('BlockedListResponseSchema', () => {
  it('is closed, so paging or a count cannot be added unilaterally', () => {
    expect(BlockedListResponseSchema.safeParse({ items: [], total: 3 }).success).toBe(false);
    expect(BlockedListResponseSchema.parse({ items: [] })).toEqual({ items: [] });
  });
});

describe('ReportReasonSchema', () => {
  const reason = {
    reason_id: 'r1',
    code: 'HARASSMENT',
    label: 'Harassment',
    description: null,
    requires_description: true,
  };

  it('is closed', () => {
    expect(ReportReasonSchema.parse(reason)).toEqual(reason);
    expect(ReportReasonSchema.safeParse({ ...reason, sortOrder: 5 }).success).toBe(false);
  });

  it('only accepts a code the dashboard knows how to filter', () => {
    expect(ReportReasonSchema.safeParse({ ...reason, code: 'NOT_A_REAL_REASON' }).success).toBe(false);
    expect(ReportReasonSchema.safeParse({ ...reason, code: 'FAKE_PROFILE' }).success).toBe(true);
  });
});

describe('ReportReasonListResponseSchema', () => {
  it('is closed', () => {
    expect(ReportReasonListResponseSchema.safeParse({ items: [], generated_at: 1 }).success).toBe(false);
  });
});

describe('CreateReportSchema', () => {
  it('is strict, so no field rides along into the moderation record', () => {
    expect(
      CreateReportSchema.safeParse({ reason_id: 'r', profile_id: 'p', reporter_user_id: 'someone_else' }).success,
    ).toBe(false);
  });

  it('requires both a reason and a target', () => {
    expect(CreateReportSchema.safeParse({ reason_id: 'r' }).success).toBe(false);
    expect(CreateReportSchema.safeParse({ profile_id: 'p' }).success).toBe(false);
    expect(CreateReportSchema.safeParse({ reason_id: 'r', profile_id: 'p' }).success).toBe(true);
  });

  it('caps free text at 2000 characters', () => {
    expect(
      CreateReportSchema.safeParse({ reason_id: 'r', profile_id: 'p', description: 'x'.repeat(2000) }).success,
    ).toBe(true);
    expect(
      CreateReportSchema.safeParse({ reason_id: 'r', profile_id: 'p', description: 'x'.repeat(2001) }).success,
    ).toBe(false);
  });
});

describe('ReportSummarySchema', () => {
  const summary = {
    report_id: 'rep1',
    profile_id: 'p1',
    reason_code: 'FAKE_PROFILE',
    status: 'OPEN',
    created_at: '2026-10-06T12:00:00.000Z',
  };

  it('carries no part of the review back to the reporter', () => {
    // Section 30 material. Returning it would disclose moderation activity and
    // the identity of whoever looked at the account being complained about.
    expect(ReportSummarySchema.parse(summary)).toEqual(summary);
    expect(ReportSummarySchema.safeParse({ ...summary, review_notes: 'clearly fake' }).success).toBe(false);
    expect(ReportSummarySchema.safeParse({ ...summary, action_taken: 'SUSPENDED' }).success).toBe(false);
    expect(ReportSummarySchema.safeParse({ ...summary, reviewed_by: 'admin1' }).success).toBe(false);
  });

  it('only reports a status the app is allowed to show', () => {
    expect(ReportSummarySchema.safeParse({ ...summary, status: 'IN_REVIEW' }).success).toBe(true);
    expect(ReportSummarySchema.safeParse({ ...summary, status: 'PENDING' }).success).toBe(false);
  });
});
