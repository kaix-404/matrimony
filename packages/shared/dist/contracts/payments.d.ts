/**
 * Payment contracts — spec sections 14, 15, 18, 27 and 40.
 *
 * Two boundaries live here, and both exist because of section 14: "the mobile
 * app must never be trusted to declare a payment successful." The app may ask
 * for an order and may display one, but the only path to an unlock is a
 * gateway webhook that the server has verified. Nothing in these contracts
 * accepts an amount, a payment id, or a success flag from the client, so a
 * tampered app cannot talk its way into a ContactUnlock.
 *
 * Amounts are strings in rupees with exactly two decimals, never numbers.
 * `UnlockPriceSchema` is reused from the profile contract so the price shown
 * before payment and the price snapshotted on the order are the same type and
 * cannot drift apart in shape.
 */
import { z } from 'zod';
/**
 * Unlock the contact behind one profile.
 *
 * The only field is the target. The amount is never accepted: it is derived
 * server-side from the target's net-worth category and the active
 * `pricing_config` row, so a client cannot name its own price.
 */
export declare const CreateUnlockOrderSchema: z.ZodObject<{
    profile_id: z.ZodString;
}, "strict", z.ZodTypeAny, {
    profile_id: string;
}, {
    profile_id: string;
}>;
export type CreateUnlockOrderRequest = z.infer<typeof CreateUnlockOrderSchema>;
export declare const PAYMENT_PURPOSES: readonly ["UNLOCK", "SETUP_FEE"];
/**
 * Everything the app needs to open the gateway's checkout, and nothing that
 * would let it skip it.
 *
 * `gateway_order_id` is the gateway's identifier, not ours: the app hands it
 * back to Razorpay to open the payment sheet. It grants no access — the
 * `payment_id` that does is only used for reconciliation queries.
 */
export declare const PaymentOrderSchema: z.ZodObject<{
    payment_id: z.ZodString;
    purpose: z.ZodEnum<["UNLOCK", "SETUP_FEE"]>;
    gateway: z.ZodLiteral<"RAZORPAY">;
    gateway_order_id: z.ZodString;
    /**
     * The gateway's publishable key. It is safe to hand to a client — it
     * identifies the merchant and cannot sign or capture anything, unlike the
     * secret half — and checkout cannot be opened without it. Serving it on the
     * order (rather than baking it into the app) keeps one source of truth and
     * lets a key rotation take effect without an app release.
     */
    key_id: z.ZodString;
    amount: z.ZodObject<{
        base_amount: z.ZodString;
        gst_rate: z.ZodString;
        gst_amount: z.ZodString;
        total_amount: z.ZodString;
        currency: z.ZodLiteral<"INR">;
    }, "strict", z.ZodTypeAny, {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    }, {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    }>;
    /** Present on unlock orders only: which profile was bought. */
    profile: z.ZodOptional<z.ZodObject<{
        profile_id: z.ZodString;
        first_name: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        profile_id: string;
        first_name: string;
    }, {
        profile_id: string;
        first_name: string;
    }>>;
    /** Section 15: the disclosure window, so the app can show a countdown. */
    unlock_window_hours: z.ZodOptional<z.ZodNumber>;
    created_at: z.ZodString;
}, "strict", z.ZodTypeAny, {
    created_at: string;
    payment_id: string;
    purpose: "UNLOCK" | "SETUP_FEE";
    gateway: "RAZORPAY";
    gateway_order_id: string;
    key_id: string;
    amount: {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    };
    profile?: {
        profile_id: string;
        first_name: string;
    } | undefined;
    unlock_window_hours?: number | undefined;
}, {
    created_at: string;
    payment_id: string;
    purpose: "UNLOCK" | "SETUP_FEE";
    gateway: "RAZORPAY";
    gateway_order_id: string;
    key_id: string;
    amount: {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    };
    profile?: {
        profile_id: string;
        first_name: string;
    } | undefined;
    unlock_window_hours?: number | undefined;
}>;
export type PaymentOrderResponse = z.infer<typeof PaymentOrderSchema>;
/**
 * Acknowledgement for a gateway webhook.
 *
 * Deliberately says nothing about whether an unlock was granted. Razorpay
 * retries anything that is not a 2xx, so this response is on the hot path of
 * delivery: leaking the outcome would let an unauthenticated caller use the
 * endpoint to probe which payments exist. `duplicate` is returned because the
 * gateway's own retry logic is the only legitimate consumer of it.
 */
export declare const PaymentWebhookAckSchema: z.ZodObject<{
    received: z.ZodLiteral<true>;
    event_id: z.ZodString;
    duplicate: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    received: true;
    event_id: string;
    duplicate: boolean;
}, {
    received: true;
    event_id: string;
    duplicate: boolean;
}>;
export type PaymentWebhookAck = z.infer<typeof PaymentWebhookAckSchema>;
/**
 * Reconcile one of the caller's own payments.
 *
 * Section 27 requires the app to be able to show payment status, and the
 * userId filter is what keeps that from becoming a way to read anyone's
 * payment history.
 */
export declare const PaymentStatusSchema: z.ZodObject<{
    payment_id: z.ZodString;
    purpose: z.ZodEnum<["UNLOCK", "SETUP_FEE"]>;
    status: z.ZodEnum<["CREATED", "PENDING", "SUCCESS", "FAILED", "CANCELLED", "REFUND_PENDING", "REFUNDED", "PARTIALLY_REFUNDED"]>;
    amount: z.ZodObject<{
        base_amount: z.ZodString;
        gst_rate: z.ZodString;
        gst_amount: z.ZodString;
        total_amount: z.ZodString;
        currency: z.ZodLiteral<"INR">;
    }, "strict", z.ZodTypeAny, {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    }, {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    }>;
    /** Server-side unlock state, never a client timer (section 15). */
    unlock: z.ZodOptional<z.ZodObject<{
        unlocked_at: z.ZodString;
        unlock_expires_at: z.ZodString;
        remaining_ms: z.ZodNumber;
        status: z.ZodEnum<["ACTIVE", "EXPIRED", "REVOKED"]>;
    }, "strict", z.ZodTypeAny, {
        status: "ACTIVE" | "EXPIRED" | "REVOKED";
        unlock_expires_at: string;
        unlocked_at: string;
        remaining_ms: number;
    }, {
        status: "ACTIVE" | "EXPIRED" | "REVOKED";
        unlock_expires_at: string;
        unlocked_at: string;
        remaining_ms: number;
    }>>;
    created_at: z.ZodString;
    paid_at: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    status: "CREATED" | "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "REFUND_PENDING" | "REFUNDED" | "PARTIALLY_REFUNDED";
    created_at: string;
    payment_id: string;
    purpose: "UNLOCK" | "SETUP_FEE";
    amount: {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    };
    paid_at: string | null;
    unlock?: {
        status: "ACTIVE" | "EXPIRED" | "REVOKED";
        unlock_expires_at: string;
        unlocked_at: string;
        remaining_ms: number;
    } | undefined;
}, {
    status: "CREATED" | "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" | "REFUND_PENDING" | "REFUNDED" | "PARTIALLY_REFUNDED";
    created_at: string;
    payment_id: string;
    purpose: "UNLOCK" | "SETUP_FEE";
    amount: {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    };
    paid_at: string | null;
    unlock?: {
        status: "ACTIVE" | "EXPIRED" | "REVOKED";
        unlock_expires_at: string;
        unlocked_at: string;
        remaining_ms: number;
    } | undefined;
}>;
export type PaymentStatusResponse = z.infer<typeof PaymentStatusSchema>;
/**
 * One unlock, as the buyer sees it.
 *
 * `display_name` is null once the window has closed. A list endpoint that kept
 * rendering names would re-disclose, on every page load, exactly the fields
 * section 13 withholds until payment — the one thing an expired unlock must not
 * do is keep paying out.
 */
export declare const UnlockSummarySchema: z.ZodObject<{
    profile_id: z.ZodString;
    display_name: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<["ACTIVE", "EXPIRED", "REVOKED"]>;
    unlocked_at: z.ZodString;
    unlock_expires_at: z.ZodString;
    remaining_ms: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    status: "ACTIVE" | "EXPIRED" | "REVOKED";
    profile_id: string;
    unlock_expires_at: string;
    display_name: string | null;
    unlocked_at: string;
    remaining_ms: number;
}, {
    status: "ACTIVE" | "EXPIRED" | "REVOKED";
    profile_id: string;
    unlock_expires_at: string;
    display_name: string | null;
    unlocked_at: string;
    remaining_ms: number;
}>;
export type UnlockSummary = z.infer<typeof UnlockSummarySchema>;
export declare const UnlockListResponseSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        profile_id: z.ZodString;
        display_name: z.ZodNullable<z.ZodString>;
        status: z.ZodEnum<["ACTIVE", "EXPIRED", "REVOKED"]>;
        unlocked_at: z.ZodString;
        unlock_expires_at: z.ZodString;
        remaining_ms: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        status: "ACTIVE" | "EXPIRED" | "REVOKED";
        profile_id: string;
        unlock_expires_at: string;
        display_name: string | null;
        unlocked_at: string;
        remaining_ms: number;
    }, {
        status: "ACTIVE" | "EXPIRED" | "REVOKED";
        profile_id: string;
        unlock_expires_at: string;
        display_name: string | null;
        unlocked_at: string;
        remaining_ms: number;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    items: {
        status: "ACTIVE" | "EXPIRED" | "REVOKED";
        profile_id: string;
        unlock_expires_at: string;
        display_name: string | null;
        unlocked_at: string;
        remaining_ms: number;
    }[];
}, {
    items: {
        status: "ACTIVE" | "EXPIRED" | "REVOKED";
        profile_id: string;
        unlock_expires_at: string;
        display_name: string | null;
        unlocked_at: string;
        remaining_ms: number;
    }[];
}>;
export type UnlockListResponse = z.infer<typeof UnlockListResponseSchema>;
//# sourceMappingURL=payments.d.ts.map