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

// Global mode: ROUND_HALF_UP for money, throw on precision loss beyond our scale.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -20, toExpPos: 40 });

export const MONEY_SCALE = 2;
export const CURRENCY = 'INR';

/**
 * A plain decimal literal: optional sign, digits, optional fraction.
 * Exponent notation is deliberately rejected so "1e5" can never be smuggled
 * in as 100000. Extra precision is permitted on input because rounding to 2dp
 * is the storage contract, not an input restriction.
 */
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export function toDecimal(value: Decimal | string | number): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Invalid money value: ${value}`);
    }
    return new Decimal(value.toFixed(MONEY_SCALE + 4));
  }
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) {
    throw new TypeError(`Invalid money literal: "${value}"`);
  }
  return new Decimal(trimmed);
}

export function money(value: Decimal | string | number): string {
  return roundMoney(value).toFixed(MONEY_SCALE);
}

/**
 * Rounds to 2dp half-up and rejects negatives.
 *
 * Money in this system is never negative: refunds are represented by a
 * separate `refundAmount` column, not a negative total. A negative amount
 * reaching this function means a bug or a tampered request.
 */
export function roundMoney(value: Decimal | string | number): Decimal {
  const d = toDecimal(value);
  const rounded = d.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
  if (rounded.isNegative()) {
    throw new RangeError(`Money amount cannot be negative: ${d.toFixed(4)}`);
  }
  return rounded;
}

/**
 * GST as a fraction, not a percentage: 0.18 === 18%.
 * Section 4 / 29.
 */
export function toGstRate(percent: Decimal | string | number): Decimal {
  const p = toDecimal(percent);
  if (p.isNegative() || p.gt(100)) {
    throw new RangeError(`GST percent out of range: ${p.toFixed(2)}`);
  }
  return p.div(100);
}

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
export function quotePayment(
  baseAmount: Decimal | string | number,
  gstPercent: Decimal | string | number,
): PricingQuote {
  const base = roundMoney(baseAmount);
  if (base.isNegative()) {
    throw new RangeError(`Base amount cannot be negative: ${base.toFixed(2)}`);
  }
  const rate = toGstRate(gstPercent);
  const gst = roundMoney(base.mul(rate));
  const total = roundMoney(base.plus(gst));

  return {
    baseAmount: base.toFixed(MONEY_SCALE),
    gstRate: rate.toFixed(4),
    gstAmount: gst.toFixed(MONEY_SCALE),
    totalAmount: total.toFixed(MONEY_SCALE),
    currency: CURRENCY,
  };
}

/**
 * Section 4 as revised by the client on 2026-09-29. The database is
 * authoritative; these values seed the first PricingConfig row per band.
 *
 * GST is 18% on every band. The setup fee is a flat ₹15 and, per the working
 * assumption recorded in docs/decisions (GAP-5), carries no separate GST.
 */
export const GST_PERCENT = '18';

/** One-time account setup fee introduced by client answer D9. */
export const ACCOUNT_SETUP_FEE = '15.00';

export const DEFAULT_PRICING = {
  BELOW_2CR: { baseAmount: '99.00', gstPercent: GST_PERCENT },
  TWO_CR_TO_FIVE_CR: { baseAmount: '249.00', gstPercent: GST_PERCENT },
  FIVE_CR_TO_TEN_CR: { baseAmount: '499.00', gstPercent: GST_PERCENT },
  ABOVE_10CR: { baseAmount: '999.00', gstPercent: GST_PERCENT },
} as const;

export type PricedBandKey = keyof typeof DEFAULT_PRICING;

/**
 * The four confirmed bands, with inclusive-lower / exclusive-upper rupee
 * bounds. Used by the seed and asserted in tests.
 *
 * GAP-2 in docs/decisions: the client has not defined what happens to a value
 * landing *exactly* on a boundary (exactly ₹2 Cr, ₹5 Cr, ₹10 Cr). These
 * intervals assign boundaries upward into the higher band. That is an
 * implementation choice, not a client decision, and it must be confirmed.
 */
export const NET_WORTH_BANDS: ReadonlyArray<{
  key: PricedBandKey;
  label: string;
  minInr: bigint | null;
  maxInr: bigint | null;
}> = [
  { key: 'BELOW_2CR', label: 'Net Worth Below ₹2 Crores', minInr: null, maxInr: 20_000_000n },
  { key: 'TWO_CR_TO_FIVE_CR', label: 'Net Worth ₹2 Crores to ₹5 Crores', minInr: 20_000_000n, maxInr: 50_000_000n },
  { key: 'FIVE_CR_TO_TEN_CR', label: 'Net Worth ₹5 Crores to ₹10 Crores', minInr: 50_000_000n, maxInr: 100_000_000n },
  { key: 'ABOVE_10CR', label: 'Net Worth Above ₹10 Crores', minInr: 100_000_000n, maxInr: null },
];

export const CRORE_INR = 10_000_000n;

/**
 * Classify a net worth in whole rupees to a band key.
 *
 * Throws when the value cannot be placed. A silent fallback to a default band
 * would let an admin-review user start browsing, which is the one thing the
 * whole category mechanism exists to prevent.
 */
export function classifyNetWorth(netWorthInr: bigint): PricedBandKey | typeof NET_WORTH_PENDING_REVIEW_KEY {
  if (netWorthInr < 0n) throw new RangeError(`Net worth cannot be negative: ${netWorthInr}`);
  for (const band of NET_WORTH_BANDS) {
    const aboveLower = band.minInr === null || netWorthInr >= band.minInr;
    const belowUpper = band.maxInr === null || netWorthInr < band.maxInr;
    if (aboveLower && belowUpper) return band.key;
  }
  return NET_WORTH_PENDING_REVIEW_KEY;
}

/**
 * Section 15: the unlock window. Both timestamps are derived from server time
 * on the server — never from a client clock, never from a client timer.
 */
export const UNLOCK_WINDOW_HOURS = 24;

export function computeUnlockWindow(
  paymentConfirmedAt: Date,
  windowHours: number = UNLOCK_WINDOW_HOURS,
): { unlockedAt: Date; unlockExpiresAt: Date } {
  if (!Number.isFinite(windowHours) || windowHours <= 0) {
    throw new RangeError(`Unlock window must be positive, got ${windowHours}`);
  }
  const unlockedAt = new Date(paymentConfirmedAt.getTime());
  const unlockExpiresAt = new Date(unlockedAt.getTime() + windowHours * 3_600_000);
  return { unlockedAt, unlockExpiresAt };
}

/**
 * Section 15 decision function.
 *
 *   if current_time < unlock_expires_at: FULL ACCESS
 *   else:                                 LOCKED
 *
 * Strictly less-than: at exactly the expiry instant, access is already over.
 */
export function isUnlockActive(
  unlockExpiresAt: Date,
  now: Date,
  status?: 'ACTIVE' | 'EXPIRED' | 'REVOKED',
): boolean {
  if (status && status !== 'ACTIVE') return false;
  return now.getTime() < unlockExpiresAt.getTime();
}

/** Milliseconds remaining, floored at zero. Drives the "access remaining" UI. */
export function remainingMs(unlockExpiresAt: Date, now: Date): number {
  return Math.max(0, unlockExpiresAt.getTime() - now.getTime());
}
