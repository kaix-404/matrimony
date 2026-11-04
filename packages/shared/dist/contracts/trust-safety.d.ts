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
/**
 * Block one profile.
 *
 * The profile id, not the owner's user id: the caller has only ever been shown a
 * profile, and accepting a raw `user_id` would make blocking a way to confirm
 * whether an arbitrary account exists.
 */
export declare const BlockProfileSchema: z.ZodObject<{
    profile_id: z.ZodString;
}, "strict", z.ZodTypeAny, {
    profile_id: string;
}, {
    profile_id: string;
}>;
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
export declare const BlockedProfileSchema: z.ZodObject<{
    profile_id: z.ZodString;
    photo: z.ZodNullable<z.ZodObject<{
        photo_id: z.ZodString;
        url: z.ZodString;
        width_px: z.ZodNullable<z.ZodNumber>;
        height_px: z.ZodNullable<z.ZodNumber>;
        is_primary: z.ZodBoolean;
        photo_type: z.ZodEnum<["SINGLE", "FAMILY"]>;
    }, "strict", z.ZodTypeAny, {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }, {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }>>;
    blocked_at: z.ZodString;
}, "strict", z.ZodTypeAny, {
    photo: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    } | null;
    profile_id: string;
    blocked_at: string;
}, {
    photo: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    } | null;
    profile_id: string;
    blocked_at: string;
}>;
export type BlockedProfile = z.infer<typeof BlockedProfileSchema>;
export declare const BlockedListResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        profile_id: z.ZodString;
        photo: z.ZodNullable<z.ZodObject<{
            photo_id: z.ZodString;
            url: z.ZodString;
            width_px: z.ZodNullable<z.ZodNumber>;
            height_px: z.ZodNullable<z.ZodNumber>;
            is_primary: z.ZodBoolean;
            photo_type: z.ZodEnum<["SINGLE", "FAMILY"]>;
        }, "strict", z.ZodTypeAny, {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        }, {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        }>>;
        blocked_at: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        profile_id: string;
        blocked_at: string;
    }, {
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        profile_id: string;
        blocked_at: string;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    items: {
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        profile_id: string;
        blocked_at: string;
    }[];
}, {
    items: {
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        profile_id: string;
        blocked_at: string;
    }[];
}>;
export type BlockedListResponse = z.infer<typeof BlockedListResponseSchema>;
/**
 * The outcome of `POST /blocks`.
 *
 * Always 201, whether or not a row was inserted this time. "Blocked" is the
 * state the app shows either way, so an endpoint that answered 409 on a retry
 * would turn a recovered connection into an error screen for somebody who did
 * successfully block someone.
 */
export declare const BlockResultSchema: z.ZodObject<{
    blocked: z.ZodLiteral<true>;
    profile: z.ZodObject<{
        profile_id: z.ZodString;
        photo: z.ZodNullable<z.ZodObject<{
            photo_id: z.ZodString;
            url: z.ZodString;
            width_px: z.ZodNullable<z.ZodNumber>;
            height_px: z.ZodNullable<z.ZodNumber>;
            is_primary: z.ZodBoolean;
            photo_type: z.ZodEnum<["SINGLE", "FAMILY"]>;
        }, "strict", z.ZodTypeAny, {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        }, {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        }>>;
        blocked_at: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        profile_id: string;
        blocked_at: string;
    }, {
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        profile_id: string;
        blocked_at: string;
    }>;
}, "strict", z.ZodTypeAny, {
    profile: {
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        profile_id: string;
        blocked_at: string;
    };
    blocked: true;
}, {
    profile: {
        photo: {
            photo_id: string;
            url: string;
            width_px: number | null;
            height_px: number | null;
            is_primary: boolean;
            photo_type: "SINGLE" | "FAMILY";
        } | null;
        profile_id: string;
        blocked_at: string;
    };
    blocked: true;
}>;
export type BlockResult = z.infer<typeof BlockResultSchema>;
/**
 * The reason list, as the app renders it.
 *
 * Admin-configurable (section 20: "Report reasons should be configurable by
 * Admin"), so the client is never allowed to invent a reason string — it picks a
 * `reason_id` from this list and the server resolves the code.
 */
export declare const ReportReasonSchema: z.ZodObject<{
    reason_id: z.ZodString;
    code: z.ZodEnum<["FAKE_PROFILE", "INCORRECT_INFORMATION", "INAPPROPRIATE_CONTENT", "INCORRECT_CONTACT", "HARASSMENT", "OTHER"]>;
    label: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    /** Tells the app to render a free-text box before it can submit. */
    requires_description: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    code: "OTHER" | "FAKE_PROFILE" | "INCORRECT_INFORMATION" | "INAPPROPRIATE_CONTENT" | "INCORRECT_CONTACT" | "HARASSMENT";
    label: string;
    description: string | null;
    reason_id: string;
    requires_description: boolean;
}, {
    code: "OTHER" | "FAKE_PROFILE" | "INCORRECT_INFORMATION" | "INAPPROPRIATE_CONTENT" | "INCORRECT_CONTACT" | "HARASSMENT";
    label: string;
    description: string | null;
    reason_id: string;
    requires_description: boolean;
}>;
export type ReportReason = z.infer<typeof ReportReasonSchema>;
export declare const ReportReasonListResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        reason_id: z.ZodString;
        code: z.ZodEnum<["FAKE_PROFILE", "INCORRECT_INFORMATION", "INAPPROPRIATE_CONTENT", "INCORRECT_CONTACT", "HARASSMENT", "OTHER"]>;
        label: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        /** Tells the app to render a free-text box before it can submit. */
        requires_description: z.ZodBoolean;
    }, "strict", z.ZodTypeAny, {
        code: "OTHER" | "FAKE_PROFILE" | "INCORRECT_INFORMATION" | "INAPPROPRIATE_CONTENT" | "INCORRECT_CONTACT" | "HARASSMENT";
        label: string;
        description: string | null;
        reason_id: string;
        requires_description: boolean;
    }, {
        code: "OTHER" | "FAKE_PROFILE" | "INCORRECT_INFORMATION" | "INAPPROPRIATE_CONTENT" | "INCORRECT_CONTACT" | "HARASSMENT";
        label: string;
        description: string | null;
        reason_id: string;
        requires_description: boolean;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    items: {
        code: "OTHER" | "FAKE_PROFILE" | "INCORRECT_INFORMATION" | "INAPPROPRIATE_CONTENT" | "INCORRECT_CONTACT" | "HARASSMENT";
        label: string;
        description: string | null;
        reason_id: string;
        requires_description: boolean;
    }[];
}, {
    items: {
        code: "OTHER" | "FAKE_PROFILE" | "INCORRECT_INFORMATION" | "INAPPROPRIATE_CONTENT" | "INCORRECT_CONTACT" | "HARASSMENT";
        label: string;
        description: string | null;
        reason_id: string;
        requires_description: boolean;
    }[];
}>;
export type ReportReasonListResponse = z.infer<typeof ReportReasonListResponseSchema>;
/**
 * File a report.
 *
 * Exactly one target. Accepting both a profile and a user id would let the same
 * incident be filed against two rows and reviewed twice, and the schema keeps a
 * caller from naming a target the app never showed them.
 */
export declare const CreateReportSchema: z.ZodObject<{
    reason_id: z.ZodString;
    /** Which profile the complaint is about. */
    profile_id: z.ZodString;
    /** Required whenever the chosen reason is flagged `requires_description`. */
    description: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    profile_id: string;
    reason_id: string;
    description?: string | undefined;
}, {
    profile_id: string;
    reason_id: string;
    description?: string | undefined;
}>;
export type CreateReportRequest = z.infer<typeof CreateReportSchema>;
/**
 * The report as the filing user sees it.
 *
 * Deliberately omits review notes, action taken and the reviewing admin — those
 * are section 30 material for the dashboard, and returning them to the reporter
 * would disclose moderation activity and the identity of the reviewer.
 */
export declare const ReportSummarySchema: z.ZodObject<{
    report_id: z.ZodString;
    profile_id: z.ZodString;
    reason_code: z.ZodEnum<["FAKE_PROFILE", "INCORRECT_INFORMATION", "INAPPROPRIATE_CONTENT", "INCORRECT_CONTACT", "HARASSMENT", "OTHER"]>;
    status: z.ZodEnum<["OPEN", "IN_REVIEW", "DISMISSED", "ACTIONED"]>;
    created_at: z.ZodString;
}, "strict", z.ZodTypeAny, {
    status: "OPEN" | "IN_REVIEW" | "DISMISSED" | "ACTIONED";
    created_at: string;
    profile_id: string;
    report_id: string;
    reason_code: "OTHER" | "FAKE_PROFILE" | "INCORRECT_INFORMATION" | "INAPPROPRIATE_CONTENT" | "INCORRECT_CONTACT" | "HARASSMENT";
}, {
    status: "OPEN" | "IN_REVIEW" | "DISMISSED" | "ACTIONED";
    created_at: string;
    profile_id: string;
    report_id: string;
    reason_code: "OTHER" | "FAKE_PROFILE" | "INCORRECT_INFORMATION" | "INAPPROPRIATE_CONTENT" | "INCORRECT_CONTACT" | "HARASSMENT";
}>;
export type ReportSummary = z.infer<typeof ReportSummarySchema>;
/**
 * What the app renders once a deletion has been accepted.
 *
 * `purge_after` is the retention deadline from client answer F6, so the user is
 * told when the record becomes irreversibly erased instead of being left to
 * guess whether "deleted" meant now or eventually. It is deliberately the only
 * thing returned: there is nothing else about a deleted account that the caller
 * does not already know.
 */
export declare const AccountDeletionResultSchema: z.ZodObject<{
    deleted: z.ZodLiteral<true>;
    purge_after: z.ZodString;
}, "strict", z.ZodTypeAny, {
    deleted: true;
    purge_after: string;
}, {
    deleted: true;
    purge_after: string;
}>;
export type AccountDeletionResult = z.infer<typeof AccountDeletionResultSchema>;
//# sourceMappingURL=trust-safety.d.ts.map