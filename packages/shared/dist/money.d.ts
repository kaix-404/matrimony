/**
 * Money and pricing — spec section 4 and section 29.
 *
 * Rules encoded here:
 *   * All arithmetic uses decimal.js. Binary floating point must never touch a
 *     rupee amount (0.1 + 0.2 !== 0.3 is not an acceptable pricing bug).
 *   * GST is computed on the base and rounded half-up to 2 decimal places.
 *   * The quote is a snapshot: once a Payment row exists, its stored columns
 *     are authoritative and this function must not be re-run against a newer
 *     price (section 29 — "Existing completed payments retain their original
 *     transaction amount").
 */
import Decimal from 'decimal.js';
import { NET_WORTH_PENDING_REVIEW_KEY } from './enums.js';
export declare const MONEY_SCALE = 2;
export declare const CURRENCY = "INR";
export declare function toDecimal(value: Decimal | string | number): Decimal;
export declare function money(value: Decimal | string | number): string;
/**
 * Rounds to 2dp half-up and rejects negatives.
 *
 * Money in this system is never negative: refunds are represented by a
 * separate `refundAmount` column, not a negative total. A negative amount
 * reaching this function means a bug or a tampered request.
 */
export declare function roundMoney(value: Decimal | string | number): Decimal;
/**
 * GST as a fraction, not a percentage: 0.18 === 18%.
 * Section 4 / 29.
 */
export declare function toGstRate(percent: Decimal | string | number): Decimal;
export interface PricingQuote {
    /** Excluded from GST. */
    baseAmount: string;
    /** Rate as a fraction, e.g. "0.18". */
    gstRate: string;
    gstAmount: string;
    totalAmount: string;
    currency: typeof CURRENCY;
}
/**
 * Compute the payable amount.
 *
 * Verified against the section 4 schedule:
 *   base 99.00  at 18% -> gst 17.82 -> total 116.82
 *   base 249.00 at 18% -> gst 44.82 -> total 293.82
 */
export declare function quotePayment(baseAmount: Decimal | string | number, gstPercent: Decimal | string | number): PricingQuote;
/**
 * GST is 18% on every band. The setup fee is a flat ₹15 base and, per the
 * resolution of GAP-5 on 2026-10-03, carries the same 18% GST added on top, so
 * the amount payable is ₹17.70.
 */
export declare const GST_PERCENT = "18";
/**
 * One-time account setup fee introduced by client answer D9, as the **base**
 * amount. It is not the amount charged: GST applies on top, so
 * `quotePayment(ACCOUNT_SETUP_FEE, GST_PERCENT).totalAmount` is ₹17.70.
 *
 * Kept flat rather than derived from net worth because it is a platform charge
 * for creating the account, not a price for anything the user receives.
 */
export declare const ACCOUNT_SETUP_FEE = "15.00";
export declare const DEFAULT_PRICING: {
    readonly BELOW_2CR: {
        readonly baseAmount: "99.00";
        readonly gstPercent: "18";
    };
    readonly TWO_CR_TO_FIVE_CR: {
        readonly baseAmount: "249.00";
        readonly gstPercent: "18";
    };
    readonly FIVE_CR_TO_TEN_CR: {
        readonly baseAmount: "499.00";
        readonly gstPercent: "18";
    };
    readonly ABOVE_10CR: {
        readonly baseAmount: "999.00";
        readonly gstPercent: "18";
    };
};
export type PricedBandKey = keyof typeof DEFAULT_PRICING;
/**
 * The four confirmed bands, with inclusive-lower / exclusive-upper rupee
 * bounds. Used by the seed and asserted in tests.
 *
 * GAP-2 (closed 2026-10-23, client answer 5): a value landing *exactly* on a
 * boundary (exactly ₹2 Cr, ₹5 Cr, ₹10 Cr) is assigned **upward** into the higher
 * band, which is what these inclusive-lower / exclusive-upper intervals do. This
 * was the client's confirmed choice, not merely an implementation default.
 */
export declare const NET_WORTH_BANDS: ReadonlyArray<{
    key: PricedBandKey;
    label: string;
    minInr: bigint | null;
    maxInr: bigint | null;
}>;
export declare const CRORE_INR = 10000000n;
/**
 * Classify a net worth in whole rupees to a band key.
 *
 * Throws when the value cannot be placed. A silent fallback to a default band
 * would let an admin-review user start browsing, which is the one thing the
 * whole category mechanism exists to prevent.
 */
export declare function classifyNetWorth(netWorthInr: bigint): PricedBandKey | typeof NET_WORTH_PENDING_REVIEW_KEY;
/**
 * Section 15: the unlock window. Both timestamps are derived from server time
 * on the server — never from a client clock, never from a client timer.
 */
export declare const UNLOCK_WINDOW_HOURS = 24;
export declare function computeUnlockWindow(paymentConfirmedAt: Date, windowHours?: number): {
    unlockedAt: Date;
    unlockExpiresAt: Date;
};
/**
 * Section 15 decision function.
 *
 *   if current_time < unlock_expires_at: FULL ACCESS
 *   else:                                 LOCKED
 *
 * Strictly less-than: at exactly the expiry instant, access is already over.
 */
export declare function isUnlockActive(unlockExpiresAt: Date, now: Date, status?: 'ACTIVE' | 'EXPIRED' | 'REVOKED'): boolean;
/** Milliseconds remaining, floored at zero. Drives the "access remaining" UI. */
export declare function remainingMs(unlockExpiresAt: Date, now: Date): number;
//# sourceMappingURL=money.d.ts.map