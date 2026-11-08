/**
 * Data-subject request contracts — section 21's access/export right.
 *
 * The admin queue has existed for a while but nothing could put a row in it: the
 * member app had no way to ask for their data, so the only requests that could
 * ever be resolved were ones written by hand. This is the member's half.
 *
 * Only `EXPORT` is requestable from the app. Erasure is already a separate flow
 * (`POST /delete-account`) that verifies an OTP before it anonymises the account;
 * a second erasure path here would be a request that nothing performs, sitting in
 * a queue behind a flow the member never completed.
 */

import { z } from 'zod';
import { DATA_REQUEST_STATUSES, DATA_REQUEST_TYPES } from '../enums.js';

/**
 * Asking for a copy of one's own data.
 *
 * `.strict()` and a single permitted literal: the type is not a member choice, it
 * is what this endpoint does, so a client that sends `"type": "ERASURE"` must be
 * refused rather than quietly booked as an export.
 */
export const CreateDataRequestSchema = z
  .object({
    type: z.literal(DATA_REQUEST_TYPES[0]),
  })
  .strict();

export type CreateDataRequestInput = z.infer<typeof CreateDataRequestSchema>;

/**
 * One request, as the member who filed it sees it.
 *
 * Carries no `user_id` (the caller is the subject; the field could only ever
 * repeat their own id) and no `handled_by_admin_id` (which administrator acted is
 * internal). `resolution_notes` is included deliberately: a rejected request is a
 * decision the member is entitled to read, and the statutorily interesting field
 * is `due_at`, the date by which they should hear back.
 */
export const DataRequestSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(DATA_REQUEST_TYPES),
    status: z.enum(DATA_REQUEST_STATUSES),
    requested_at: z.string().datetime(),
    due_at: z.string().datetime(),
    completed_at: z.string().datetime().nullable(),
    resolution_notes: z.string().nullable(),
  })
  .strict();

export type DataRequest = z.infer<typeof DataRequestSchema>;

/**
 * The caller's own requests, newest first.
 *
 * No cursor: a member files one of these when they want their data, not as a
 * habit, so the list is bounded by effort the way the blocked list is.
 */
export const DataRequestListResponseSchema = z
  .object({
    requests: z.array(DataRequestSchema),
  })
  .strict();

export type DataRequestListResponse = z.infer<typeof DataRequestListResponseSchema>;
