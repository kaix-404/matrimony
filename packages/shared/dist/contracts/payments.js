"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnlockListResponseSchema = exports.UnlockSummarySchema = exports.PaymentStatusSchema = exports.PaymentWebhookAckSchema = exports.PaymentOrderSchema = exports.PAYMENT_PURPOSES = exports.CreateUnlockOrderSchema = void 0;
const zod_1 = require("zod");
const profile_js_1 = require("./profile.js");
// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
/**
 * Unlock the contact behind one profile.
 *
 * The only field is the target. The amount is never accepted: it is derived
 * server-side from the target's net-worth category and the active
 * `pricing_config` row, so a client cannot name its own price.
 */
exports.CreateUnlockOrderSchema = zod_1.z
    .object({
    profile_id: zod_1.z.string().min(1),
})
    .strict();
// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------
exports.PAYMENT_PURPOSES = ['UNLOCK', 'SETUP_FEE'];
/**
 * Everything the app needs to open the gateway's checkout, and nothing that
 * would let it skip it.
 *
 * `gateway_order_id` is the gateway's identifier, not ours: the app hands it
 * back to Razorpay to open the payment sheet. It grants no access — the
 * `payment_id` that does is only used for reconciliation queries.
 */
exports.PaymentOrderSchema = zod_1.z
    .object({
    payment_id: zod_1.z.string().min(1),
    purpose: zod_1.z.enum(exports.PAYMENT_PURPOSES),
    gateway: zod_1.z.literal('RAZORPAY'),
    gateway_order_id: zod_1.z.string().min(1),
    /**
     * The gateway's publishable key. It is safe to hand to a client — it
     * identifies the merchant and cannot sign or capture anything, unlike the
     * secret half — and checkout cannot be opened without it. Serving it on the
     * order (rather than baking it into the app) keeps one source of truth and
     * lets a key rotation take effect without an app release.
     */
    key_id: zod_1.z.string().min(1),
    amount: profile_js_1.UnlockPriceSchema,
    /** Present on unlock orders only: which profile was bought. */
    profile: zod_1.z
        .object({
        profile_id: zod_1.z.string().min(1),
        // Section 13: the surname is hidden until payment, so an order
        // response — which is rendered before payment — must not carry it.
        first_name: zod_1.z.string().min(1),
    })
        .strict()
        .optional(),
    /** Section 15: the disclosure window, so the app can show a countdown. */
    unlock_window_hours: zod_1.z.number().int().positive().optional(),
    created_at: zod_1.z.string().min(1),
})
    .strict();
/**
 * Acknowledgement for a gateway webhook.
 *
 * Deliberately says nothing about whether an unlock was granted. Razorpay
 * retries anything that is not a 2xx, so this response is on the hot path of
 * delivery: leaking the outcome would let an unauthenticated caller use the
 * endpoint to probe which payments exist. `duplicate` is returned because the
 * gateway's own retry logic is the only legitimate consumer of it.
 */
exports.PaymentWebhookAckSchema = zod_1.z
    .object({
    received: zod_1.z.literal(true),
    event_id: zod_1.z.string().min(1),
    duplicate: zod_1.z.boolean(),
})
    .strict();
/**
 * Reconcile one of the caller's own payments.
 *
 * Section 27 requires the app to be able to show payment status, and the
 * userId filter is what keeps that from becoming a way to read anyone's
 * payment history.
 */
exports.PaymentStatusSchema = zod_1.z
    .object({
    payment_id: zod_1.z.string().min(1),
    purpose: zod_1.z.enum(exports.PAYMENT_PURPOSES),
    status: zod_1.z.enum([
        'CREATED',
        'PENDING',
        'SUCCESS',
        'FAILED',
        'CANCELLED',
        'REFUND_PENDING',
        'REFUNDED',
        'PARTIALLY_REFUNDED',
    ]),
    amount: profile_js_1.UnlockPriceSchema,
    /** Server-side unlock state, never a client timer (section 15). */
    unlock: zod_1.z
        .object({
        unlocked_at: zod_1.z.string().min(1),
        unlock_expires_at: zod_1.z.string().min(1),
        remaining_ms: zod_1.z.number().int().nonnegative(),
        status: zod_1.z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']),
    })
        .strict()
        .optional(),
    created_at: zod_1.z.string().min(1),
    paid_at: zod_1.z.string().min(1).nullable(),
})
    .strict();
// ---------------------------------------------------------------------------
// Unlocks held by the caller
// ---------------------------------------------------------------------------
/**
 * One unlock, as the buyer sees it.
 *
 * `display_name` is null once the window has closed. A list endpoint that kept
 * rendering names would re-disclose, on every page load, exactly the fields
 * section 13 withholds until payment — the one thing an expired unlock must not
 * do is keep paying out.
 */
exports.UnlockSummarySchema = zod_1.z
    .object({
    profile_id: zod_1.z.string().min(1),
    display_name: zod_1.z.string().nullable(),
    status: zod_1.z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']),
    unlocked_at: zod_1.z.string().min(1),
    unlock_expires_at: zod_1.z.string().min(1),
    remaining_ms: zod_1.z.number().int().nonnegative(),
})
    .strict();
exports.UnlockListResponseSchema = zod_1.z
    .object({
    items: zod_1.z.array(exports.UnlockSummarySchema),
})
    .strict();
//# sourceMappingURL=payments.js.map