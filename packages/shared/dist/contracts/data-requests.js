"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataRequestListResponseSchema = exports.DataRequestSchema = exports.CreateDataRequestSchema = void 0;
const zod_1 = require("zod");
const enums_js_1 = require("../enums.js");
/**
 * Asking for a copy of one's own data.
 *
 * `.strict()` and a single permitted literal: the type is not a member choice, it
 * is what this endpoint does, so a client that sends `"type": "ERASURE"` must be
 * refused rather than quietly booked as an export.
 */
exports.CreateDataRequestSchema = zod_1.z
    .object({
    type: zod_1.z.literal(enums_js_1.DATA_REQUEST_TYPES[0]),
})
    .strict();
/**
 * One request, as the member who filed it sees it.
 *
 * Carries no `user_id` (the caller is the subject; the field could only ever
 * repeat their own id) and no `handled_by_admin_id` (which administrator acted is
 * internal). `resolution_notes` is included deliberately: a rejected request is a
 * decision the member is entitled to read, and the statutorily interesting field
 * is `due_at`, the date by which they should hear back.
 */
exports.DataRequestSchema = zod_1.z
    .object({
    id: zod_1.z.string().min(1),
    type: zod_1.z.enum(enums_js_1.DATA_REQUEST_TYPES),
    status: zod_1.z.enum(enums_js_1.DATA_REQUEST_STATUSES),
    requested_at: zod_1.z.string().datetime(),
    due_at: zod_1.z.string().datetime(),
    completed_at: zod_1.z.string().datetime().nullable(),
    resolution_notes: zod_1.z.string().nullable(),
})
    .strict();
/**
 * The caller's own requests, newest first.
 *
 * No cursor: a member files one of these when they want their data, not as a
 * habit, so the list is bounded by effort the way the blocked list is.
 */
exports.DataRequestListResponseSchema = zod_1.z
    .object({
    requests: zod_1.z.array(exports.DataRequestSchema),
})
    .strict();
//# sourceMappingURL=data-requests.js.map