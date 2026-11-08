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
/**
 * Asking for a copy of one's own data.
 *
 * `.strict()` and a single permitted literal: the type is not a member choice, it
 * is what this endpoint does, so a client that sends `"type": "ERASURE"` must be
 * refused rather than quietly booked as an export.
 */
export declare const CreateDataRequestSchema: z.ZodObject<{
    type: z.ZodLiteral<"EXPORT">;
}, "strict", z.ZodTypeAny, {
    type: "EXPORT";
}, {
    type: "EXPORT";
}>;
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
export declare const DataRequestSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["EXPORT", "ERASURE"]>;
    status: z.ZodEnum<["REQUESTED", "IN_PROGRESS", "COMPLETED", "REJECTED"]>;
    requested_at: z.ZodString;
    due_at: z.ZodString;
    completed_at: z.ZodNullable<z.ZodString>;
    resolution_notes: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    type: "EXPORT" | "ERASURE";
    status: "REQUESTED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
    id: string;
    requested_at: string;
    due_at: string;
    completed_at: string | null;
    resolution_notes: string | null;
}, {
    type: "EXPORT" | "ERASURE";
    status: "REQUESTED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
    id: string;
    requested_at: string;
    due_at: string;
    completed_at: string | null;
    resolution_notes: string | null;
}>;
export type DataRequest = z.infer<typeof DataRequestSchema>;
/**
 * The caller's own requests, newest first.
 *
 * No cursor: a member files one of these when they want their data, not as a
 * habit, so the list is bounded by effort the way the blocked list is.
 */
export declare const DataRequestListResponseSchema: z.ZodObject<{
    requests: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["EXPORT", "ERASURE"]>;
        status: z.ZodEnum<["REQUESTED", "IN_PROGRESS", "COMPLETED", "REJECTED"]>;
        requested_at: z.ZodString;
        due_at: z.ZodString;
        completed_at: z.ZodNullable<z.ZodString>;
        resolution_notes: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        type: "EXPORT" | "ERASURE";
        status: "REQUESTED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
        id: string;
        requested_at: string;
        due_at: string;
        completed_at: string | null;
        resolution_notes: string | null;
    }, {
        type: "EXPORT" | "ERASURE";
        status: "REQUESTED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
        id: string;
        requested_at: string;
        due_at: string;
        completed_at: string | null;
        resolution_notes: string | null;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    requests: {
        type: "EXPORT" | "ERASURE";
        status: "REQUESTED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
        id: string;
        requested_at: string;
        due_at: string;
        completed_at: string | null;
        resolution_notes: string | null;
    }[];
}, {
    requests: {
        type: "EXPORT" | "ERASURE";
        status: "REQUESTED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
        id: string;
        requested_at: string;
        due_at: string;
        completed_at: string | null;
        resolution_notes: string | null;
    }[];
}>;
export type DataRequestListResponse = z.infer<typeof DataRequestListResponseSchema>;
//# sourceMappingURL=data-requests.d.ts.map