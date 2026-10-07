/**
 * Trust and safety contracts — spec sections 19, 20 and 21.
 *
 * The write side of "a user can control who they are shown". Section 19 and 20
 * both resolve to rows the user owns (`BlockedUser`, `Report`), so nothing here
 * takes an instruction about a third party's data — only about whether the two
 * accounts may still see each other.
 *
 * Every contract is `.strict()`. A moderation endpoint is exactly where an
 * accidentally-accepted extra field does the most damage, because the client and
 * the server would then disagree about what was actually recorded.
 */

import { z } from 'zod';
import { PreviewPhotoSchema } from './profile.js';

// ---------------------------------------------------------------------------
// Section 19 - block
// ---------------------------------------------------------------------------

/**
 * Block one profile.
 *
 * The profile id, not the owner's user id: the caller has only ever been shown a
 * profile, and accepting a raw `user_id` would make blocking a way to confirm
 * whether an arbitrary account exists.
 */
export const BlockProfileSchema = z
  .object({
    profile_id: z.string().min(1),
  })
  .strict();

export type BlockProfileRequest = z.infer<typeof BlockProfileSchema>;

/**
 * One entry in the blocked list (section 19's "blocked-profile management in
 * Settings").
 *
 * Carries no name. Section 13 withholds the name until payment and the discovery
 * card does not carry one either, so displaying it here would hand the caller a
 * field they have never been entitled to — blocked is not the same as unlocked.
 * The photo is what the caller used to pick the profile out of the feed, it is
 * free before payment (section 9), and so it is the only identifier that can be
 * repeated without widening disclosure.
 */
export const BlockedProfileSchema = z
  .object({
    profile_id: z.string().min(1),
    photo: PreviewPhotoSchema.nullable(),
    blocked_at: z.string().datetime(),
  })
  .strict();

export type BlockedProfile = z.infer<typeof BlockedProfileSchema>;

export const BlockedListResponseSchema = z
  .object({
    items: z.array(BlockedProfileSchema),
  })
  .strict();

export type BlockedListResponse = z.infer<typeof BlockedListResponseSchema>;

/**
 * The outcome of `POST /blocks`.
 *
 * Always 201, whether or not a row was inserted this time. "Blocked" is the
 * state the app shows either way, so an endpoint that answered 409 on a retry
 * would turn a recovered connection into an error screen for somebody who did
 * successfully block someone.
 */
export const BlockResultSchema = z
  .object({
    blocked: z.literal(true),
    profile: BlockedProfileSchema,
  })
  .strict();

export type BlockResult = z.infer<typeof BlockResultSchema>;

// ---------------------------------------------------------------------------
// Section 20 - report
// ---------------------------------------------------------------------------

/**
 * The reason list, as the app renders it.
 *
 * Admin-configurable (section 20: "Report reasons should be configurable by
 * Admin"), so the client is never allowed to invent a reason string — it picks a
 * `reason_id` from this list and the server resolves the code.
 */
export const ReportReasonSchema = z
  .object({
    reason_id: z.string().min(1),
    code: z.enum([
      'FAKE_PROFILE',
      'INCORRECT_INFORMATION',
      'INAPPROPRIATE_CONTENT',
      'INCORRECT_CONTACT',
      'HARASSMENT',
      'OTHER',
    ]),
    label: z.string().min(1),
    description: z.string().nullable(),
    /** Tells the app to render a free-text box before it can submit. */
    requires_description: z.boolean(),
  })
  .strict();

export type ReportReason = z.infer<typeof ReportReasonSchema>;

export const ReportReasonListResponseSchema = z
  .object({
    items: z.array(ReportReasonSchema),
  })
  .strict();

export type ReportReasonListResponse = z.infer<typeof ReportReasonListResponseSchema>;

/**
 * File a report.
 *
 * Exactly one target. Accepting both a profile and a user id would let the same
 * incident be filed against two rows and reviewed twice, and the schema keeps a
 * caller from naming a target the app never showed them.
 */
export const CreateReportSchema = z
  .object({
    reason_id: z.string().min(1),
    /** Which profile the complaint is about. */
    profile_id: z.string().min(1),
    /** Required whenever the chosen reason is flagged `requires_description`. */
    description: z.string().trim().max(2000).optional(),
  })
  .strict();

export type CreateReportRequest = z.infer<typeof CreateReportSchema>;

/**
 * The report as the filing user sees it.
 *
 * Deliberately omits review notes, action taken and the reviewing admin — those
 * are section 30 material for the dashboard, and returning them to the reporter
 * would disclose moderation activity and the identity of the reviewer.
 */
export const ReportSummarySchema = z
  .object({
    report_id: z.string().min(1),
    profile_id: z.string().min(1),
    reason_code: z.enum([
      'FAKE_PROFILE',
      'INCORRECT_INFORMATION',
      'INAPPROPRIATE_CONTENT',
      'INCORRECT_CONTACT',
      'HARASSMENT',
      'OTHER',
    ]),
    status: z.enum(['OPEN', 'IN_REVIEW', 'DISMISSED', 'ACTIONED']),
    created_at: z.string().datetime(),
  })
  .strict();

export type ReportSummary = z.infer<typeof ReportSummarySchema>;

// ---------------------------------------------------------------------------
// Section 21 - delete account
// ---------------------------------------------------------------------------

/**
 * What the app renders once a deletion has been accepted.
 *
 * `purge_after` is the retention deadline from client answer F6, so the user is
 * told when the record becomes irreversibly erased instead of being left to
 * guess whether "deleted" meant now or eventually. It is deliberately the only
 * thing returned: there is nothing else about a deleted account that the caller
 * does not already know.
 */
export const AccountDeletionResultSchema = z
  .object({
    deleted: z.literal(true),
    purge_after: z.string().datetime(),
  })
  .strict();

export type AccountDeletionResult = z.infer<typeof AccountDeletionResultSchema>;
