"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNLOCK_WINDOW_HOURS = exports.CRORE_INR = exports.NET_WORTH_BANDS = exports.DEFAULT_PRICING = exports.ACCOUNT_SETUP_FEE = exports.GST_PERCENT = exports.CURRENCY = exports.MONEY_SCALE = void 0;
exports.toDecimal = toDecimal;
exports.money = money;
exports.roundMoney = roundMoney;
exports.toGstRate = toGstRate;
exports.quotePayment = quotePayment;
exports.classifyNetWorth = classifyNetWorth;
exports.computeUnlockWindow = computeUnlockWindow;
exports.isUnlockActive = isUnlockActive;
exports.remainingMs = remainingMs;
const decimal_js_1 = __importDefault(require("decimal.js"));
const enums_js_1 = require("./enums.js");
// Global mode: ROUND_HALF_UP for money, throw on precision loss beyond our scale.
decimal_js_1.default.set({ precision: 28, rounding: decimal_js_1.default.ROUND_HALF_UP, toExpNeg: -20, toExpPos: 40 });
exports.MONEY_SCALE = 2;
exports.CURRENCY = 'INR';
/**
 * A plain decimal literal: optional sign, digits, optional fraction.
 * Exponent notation is deliberately rejected so "1e5" can never be smuggled
 * in as 100000. Extra precision is permitted on input because rounding to 2dp
 * is the storage contract, not an input restriction.
 */
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
/**
 * True for anything Decimal-shaped, not just our own copy.
 *
 * Prisma's driver adapter constructs Decimals from its own bundled
 * `decimal.js`, so a value read from the database fails `instanceof Decimal`
 * even though it is a Decimal. Without this branch such a value falls through
 * to `value.trim()` and throws `value.trim is not a function` — a runtime
 * failure that no type check catches, because the declared type is `Decimal`.
 */
function isDecimalLike(value) {
    return (typeof value === 'object' &&
        value !== null &&
        typeof value.toFixed === 'function');
}
function toDecimal(value) {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new TypeError(`Invalid money value: ${value}`);
        }
        return new decimal_js_1.default(value.toFixed(exports.MONEY_SCALE + 4));
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!DECIMAL_PATTERN.test(trimmed)) {
            throw new TypeError(`Invalid money literal: "${value}"`);
        }
        return new decimal_js_1.default(trimmed);
    }
    // Foreign Decimal instance. `toFixed` rather than `toString` so a value whose
    // copy of decimal.js uses exponential notation still parses as plain digits.
    if (isDecimalLike(value)) {
        return new decimal_js_1.default(value.toFixed(exports.MONEY_SCALE + 4));
    }
    throw new TypeError(`Invalid money value: ${String(value)}`);
}
function money(value) {
    return roundMoney(value).toFixed(exports.MONEY_SCALE);
}
/**
 * Rounds to 2dp half-up and rejects negatives.
 *
 * Money in this system is never negative: refunds are represented by a
 * separate `refundAmount` column, not a negative total. A negative amount
 * reaching this function means a bug or a tampered request.
 */
function roundMoney(value) {
    const d = toDecimal(value);
    const rounded = d.toDecimalPlaces(exports.MONEY_SCALE, decimal_js_1.default.ROUND_HALF_UP);
    if (rounded.isNegative()) {
        throw new RangeError(`Money amount cannot be negative: ${d.toFixed(4)}`);
    }
    return rounded;
}
/**
 * GST as a fraction, not a percentage: 0.18 === 18%.
 * Section 4 / 29.
 */
function toGstRate(percent) {
    const p = toDecimal(percent);
    if (p.isNegative() || p.gt(100)) {
        throw new RangeError(`GST percent out of range: ${p.toFixed(2)}`);
    }
    return p.div(100);
}
/**
 * Compute the payable amount.
 *
 * Verified against the section 4 schedule:
 *   base 99.00  at 18% -> gst 17.82 -> total 116.82
 *   base 249.00 at 18% -> gst 44.82 -> total 293.82
 */
function quotePayment(baseAmount, gstPercent) {
    const base = roundMoney(baseAmount);
    if (base.isNegative()) {
        throw new RangeError(`Base amount cannot be negative: ${base.toFixed(2)}`);
    }
    const rate = toGstRate(gstPercent);
    const gst = roundMoney(base.mul(rate));
    const total = roundMoney(base.plus(gst));
    return {
        baseAmount: base.toFixed(exports.MONEY_SCALE),
        gstRate: rate.toFixed(4),
        gstAmount: gst.toFixed(exports.MONEY_SCALE),
        totalAmount: total.toFixed(exports.MONEY_SCALE),
        currency: exports.CURRENCY,
    };
}
/**
 * GST is 18% on every band. The setup fee is a flat ₹15 base and, per the
 * resolution of GAP-5 on 2026-10-03, carries the same 18% GST added on top, so
 * the amount payable is ₹17.70.
 */
exports.GST_PERCENT = '18';
/**
 * One-time account setup fee introduced by client answer D9, as the **base**
 * amount. It is not the amount charged: GST applies on top, so
 * `quotePayment(ACCOUNT_SETUP_FEE, GST_PERCENT).totalAmount` is ₹17.70.
 *
 * Kept flat rather than derived from net worth because it is a platform charge
 * for creating the account, not a price for anything the user receives.
 */
exports.ACCOUNT_SETUP_FEE = '15.00';
exports.DEFAULT_PRICING = {
    BELOW_2CR: { baseAmount: '99.00', gstPercent: exports.GST_PERCENT },
    TWO_CR_TO_FIVE_CR: { baseAmount: '249.00', gstPercent: exports.GST_PERCENT },
    FIVE_CR_TO_TEN_CR: { baseAmount: '499.00', gstPercent: exports.GST_PERCENT },
    ABOVE_10CR: { baseAmount: '999.00', gstPercent: exports.GST_PERCENT },
};
/**
 * The four confirmed bands, with inclusive-lower / exclusive-upper rupee
 * bounds. Used by the seed and asserted in tests.
 *
 * GAP-2 (closed 2026-10-23, client answer 5): a value landing *exactly* on a
 * boundary (exactly ₹2 Cr, ₹5 Cr, ₹10 Cr) is assigned **upward** into the higher
 * band, which is what these inclusive-lower / exclusive-upper intervals do. This
 * was the client's confirmed choice, not merely an implementation default.
 */
exports.NET_WORTH_BANDS = [
    { key: 'BELOW_2CR', label: 'Net Worth Below ₹2 Crores', minInr: null, maxInr: 20000000n },
    { key: 'TWO_CR_TO_FIVE_CR', label: 'Net Worth ₹2 Crores to ₹5 Crores', minInr: 20000000n, maxInr: 50000000n },
    { key: 'FIVE_CR_TO_TEN_CR', label: 'Net Worth ₹5 Crores to ₹10 Crores', minInr: 50000000n, maxInr: 100000000n },
    { key: 'ABOVE_10CR', label: 'Net Worth Above ₹10 Crores', minInr: 100000000n, maxInr: null },
];
exports.CRORE_INR = 10000000n;
/**
 * Classify a net worth in whole rupees to a band key.
 *
 * Throws when the value cannot be placed. A silent fallback to a default band
 * would let an admin-review user start browsing, which is the one thing the
 * whole category mechanism exists to prevent.
 */
function classifyNetWorth(netWorthInr) {
    if (netWorthInr < 0n)
        throw new RangeError(`Net worth cannot be negative: ${netWorthInr}`);
    for (const band of exports.NET_WORTH_BANDS) {
        const aboveLower = band.minInr === null || netWorthInr >= band.minInr;
        const belowUpper = band.maxInr === null || netWorthInr < band.maxInr;
        if (aboveLower && belowUpper)
            return band.key;
    }
    return enums_js_1.NET_WORTH_PENDING_REVIEW_KEY;
}
/**
 * Section 15: the unlock window. Both timestamps are derived from server time
 * on the server — never from a client clock, never from a client timer.
 */
exports.UNLOCK_WINDOW_HOURS = 24;
function computeUnlockWindow(paymentConfirmedAt, windowHours = exports.UNLOCK_WINDOW_HOURS) {
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
function isUnlockActive(unlockExpiresAt, now, status) {
    if (status && status !== 'ACTIVE')
        return false;
    return now.getTime() < unlockExpiresAt.getTime();
}
/** Milliseconds remaining, floored at zero. Drives the "access remaining" UI. */
function remainingMs(unlockExpiresAt, now) {
    return Math.max(0, unlockExpiresAt.getTime() - now.getTime());
}
//# sourceMappingURL=money.js.map