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
import { UnlockPriceSchema } from './profile.js';

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
export const CreateUnlockOrderSchema = z
  .object({
    profile_id: z.string().min(1),
  })
  .strict();

export type CreateUnlockOrderRequest = z.infer<typeof CreateUnlockOrderSchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const PAYMENT_PURPOSES = ['UNLOCK', 'SETUP_FEE'] as const;

/**
 * Everything the app needs to open the gateway's checkout, and nothing that
 * would let it skip it.
 *
 * `gateway_order_id` is the gateway's identifier, not ours: the app hands it
 * back to Razorpay to open the payment sheet. It grants no access — the
 * `payment_id` that does is only used for reconciliation queries.
 */
export const PaymentOrderSchema = z
  .object({
    payment_id: z.string().min(1),
    purpose: z.enum(PAYMENT_PURPOSES),
    gateway: z.literal('RAZORPAY'),
    gateway_order_id: z.string().min(1),
    amount: UnlockPriceSchema,
    /** Present on unlock orders only: which profile was bought. */
    profile: z
      .object({
        profile_id: z.string().min(1),
        // Section 13: the surname is hidden until payment, so an order
        // response — which is rendered before payment — must not carry it.
        first_name: z.string().min(1),
      })
      .strict()
      .optional(),
    /** Section 15: the disclosure window, so the app can show a countdown. */
    unlock_window_hours: z.number().int().positive().optional(),
    created_at: z.string().min(1),
  })
  .strict();

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
export const PaymentWebhookAckSchema = z
  .object({
    received: z.literal(true),
    event_id: z.string().min(1),
    duplicate: z.boolean(),
  })
  .strict();

export type PaymentWebhookAck = z.infer<typeof PaymentWebhookAckSchema>;

/**
 * Reconcile one of the caller's own payments.
 *
 * Section 27 requires the app to be able to show payment status, and the
 * userId filter is what keeps that from becoming a way to read anyone's
 * payment history.
 */
export const PaymentStatusSchema = z
  .object({
    payment_id: z.string().min(1),
    purpose: z.enum(PAYMENT_PURPOSES),
    status: z.enum([
      'CREATED',
      'PENDING',
      'SUCCESS',
      'FAILED',
      'CANCELLED',
      'REFUND_PENDING',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
    ]),
    amount: UnlockPriceSchema,
    /** Server-side unlock state, never a client timer (section 15). */
    unlock: z
      .object({
        unlocked_at: z.string().min(1),
        unlock_expires_at: z.string().min(1),
        remaining_ms: z.number().int().nonnegative(),
        status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']),
      })
      .strict()
      .optional(),
    created_at: z.string().min(1),
    paid_at: z.string().min(1).nullable(),
  })
  .strict();

export type PaymentStatusResponse = z.infer<typeof PaymentStatusSchema>;
