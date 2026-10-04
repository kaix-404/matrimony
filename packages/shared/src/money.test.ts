import { describe, it, expect } from '@jest/globals';
import {
  quotePayment,
  money,
  roundMoney,
  toGstRate,
  computeUnlockWindow,
  isUnlockActive,
  remainingMs,
  classifyNetWorth,
  ACCOUNT_SETUP_FEE,
  GST_PERCENT,
  DEFAULT_PRICING,
  NET_WORTH_BANDS,
  UNLOCK_WINDOW_HOURS,
} from './money.js';
import { Decimal } from 'decimal.js';
import { NET_WORTH_PENDING_REVIEW_KEY } from './enums.js';

const CR = 10_000_000n;

/**
 * The four-band schedule the client confirmed on 2026-09-29, replacing the
 * earlier two-band one. Each total is asserted literally so a change to
 * DEFAULT_PRICING cannot slip through without failing here.
 */
describe('quotePayment — four-band schedule confirmed 2026-09-29', () => {
  it.each([
    ['BELOW_2CR', '99.00', '17.82', '116.82'],
    ['TWO_CR_TO_FIVE_CR', '249.00', '44.82', '293.82'],
    ['FIVE_CR_TO_TEN_CR', '499.00', '89.82', '588.82'],
    ['ABOVE_10CR', '999.00', '179.82', '1178.82'],
  ] as const)('%s totals correctly', (band, base, gst, total) => {
    const q = quotePayment(DEFAULT_PRICING[band].baseAmount, DEFAULT_PRICING[band].gstPercent);
    expect(q.baseAmount).toBe(base);
    expect(q.gstAmount).toBe(gst);
    expect(q.totalAmount).toBe(total);
    expect(q.currency).toBe('INR');
  });

  it('applies 18% GST to every band', () => {
    for (const band of Object.keys(DEFAULT_PRICING) as (keyof typeof DEFAULT_PRICING)[]) {
      expect(DEFAULT_PRICING[band].gstPercent).toBe('18');
    }
  });

  it('prices rise monotonically across the bands', () => {
    const totals = NET_WORTH_BANDS.map((b) => Number(quotePayment(DEFAULT_PRICING[b.key].baseAmount, 18).totalAmount));
    for (let i = 1; i < totals.length; i += 1) {
      expect(totals[i]!).toBeGreaterThan(totals[i - 1]!);
    }
  });

  it('quotes the setup fee as ₹15 plus 18% GST', () => {
    // GAP-5 was resolved on 2026-10-03: GST is added on top, so the amount the
    // user actually pays is ₹17.70, not ₹15.
    const q = quotePayment(ACCOUNT_SETUP_FEE, GST_PERCENT);
    expect(q.baseAmount).toBe('15.00');
    expect(q.gstAmount).toBe('2.70');
    expect(q.totalAmount).toBe('17.70');
  });

  it('charges the same GST rate on the setup fee as on an unlock', () => {
    // Two different rates on one product would be an invoicing error waiting to
    // happen, and the setup fee has no pricing_config row to read a rate from.
    expect(quotePayment(ACCOUNT_SETUP_FEE, GST_PERCENT).gstRate).toBe(
      quotePayment(DEFAULT_PRICING.BELOW_2CR.baseAmount, GST_PERCENT).gstRate,
    );
  });

  it('always has total == base + gst', () => {
    for (const base of ['0.00', '1.00', '99.00', '249.00', '1000.55', '12345.67']) {
      const q = quotePayment(base, 18);
      const sum = Number(q.baseAmount) + Number(q.gstAmount);
      expect(Number(q.totalAmount)).toBeCloseTo(sum, 2);
    }
  });

  it('emits 2dp strings, never floats', () => {
    const q = quotePayment('99', 18);
    for (const key of ['baseAmount', 'gstAmount', 'totalAmount'] as const) {
      expect(q[key]).toMatch(/^\d+\.\d{2}$/);
    }
  });
});

describe('decimal safety', () => {
  it('accepts a Decimal from a different copy of decimal.js', () => {
    // Prisma's driver adapter bundles its own `decimal.js`, so a Decimal read
    // from the database fails `instanceof` against this module's copy. Before
    // the duck-typed branch in toDecimal, such a value fell through to
    // `value.trim()` and threw `value.trim is not a function` at runtime — which
    // the type system accepts, because the declared type really is Decimal.
    //
    // This stands in for that foreign instance with the same shape but no
    // shared prototype.
    class ForeignDecimal {
      constructor(private readonly value: string) {}
      toFixed(places: number): string {
        const [whole, fraction = ''] = this.value.split('.');
        return fraction.length >= places
          ? `${whole}.${fraction.slice(0, places)}`
          : `${this.value}${'0'.repeat(places - fraction.length)}`;
      }
      toString(): string {
        return this.value;
      }
    }

    const foreign = new ForeignDecimal('499.00');
    expect(foreign).not.toBeInstanceOf(Decimal);
    expect(quotePayment(foreign as unknown as Decimal, '18').totalAmount).toBe('588.82');
  });

  it('parses a Decimal-like value that formats in exponent notation', () => {
    // `toFixed` rather than `toString` is what keeps this working: a foreign
    // copy configured with different exponent thresholds would emit "5e+2".
    const exponential = {
      toFixed: () => '499.0000',
      toString: () => '4.99e+2',
    };
    expect(quotePayment(exponential as unknown as Decimal, '18').totalAmount).toBe('588.82');
  });

  it('does not inherit binary floating point error', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE 754. Pricing must not depend on that being true.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(money('0.1')).toBe('0.10');
    expect(roundMoney('0.105').toFixed(2)).toBe('0.11');
  });

  it('rounds half up at the third decimal', () => {
    expect(money('1.005')).toBe('1.01');
    expect(money('1.004')).toBe('1.00');
  });

  it('rejects non-numeric and exponent-notation literals', () => {
    expect(() => money('abc')).toThrow(TypeError);
    expect(() => money('  ')).toThrow(TypeError);
    expect(() => money('1e5')).toThrow(TypeError);
    expect(() => money('1,000.00')).toThrow(TypeError);
    expect(() => money('100.00 ')).not.toThrow();
  });

  it('rounds rather than rejecting extra input precision', () => {
    // Precision above 2dp is an input fact, not an error; the 2dp storage
    // contract is applied by roundMoney.
    expect(money('1.234')).toBe('1.23');
    expect(money('1.239')).toBe('1.24');
  });

  it('rejects a negative base amount', () => {
    expect(() => quotePayment('-1.00', 18)).toThrow(RangeError);
    expect(() => money('-0.01')).toThrow(RangeError);
  });

  it('treats gstRate as a fraction', () => {
    expect(toGstRate(18).toFixed(4)).toBe('0.1800');
    expect(toGstRate('5.5').toFixed(4)).toBe('0.0550');
  });

  it('rejects an out-of-range gst percentage', () => {
    expect(() => toGstRate(101)).toThrow(RangeError);
    expect(() => toGstRate(-1)).toThrow(RangeError);
  });
});

describe('computeUnlockWindow — spec section 15', () => {
  const paid = new Date('2026-03-01T10:00:00.000Z');

  it('expires exactly 24 hours after the server-confirmed payment time', () => {
    const { unlockedAt, unlockExpiresAt } = computeUnlockWindow(paid);
    expect(unlockedAt).toEqual(paid);
    expect(unlockExpiresAt.toISOString()).toBe('2026-03-02T10:00:00.000Z');
  });

  it('defaults to the 24 hour window', () => {
    expect(UNLOCK_WINDOW_HOURS).toBe(24);
    const a = computeUnlockWindow(paid);
    const b = computeUnlockWindow(paid, 24);
    expect(a.unlockExpiresAt.getTime()).toBe(b.unlockExpiresAt.getTime());
  });

  it('does not mutate the input date', () => {
    const before = paid.getTime();
    computeUnlockWindow(paid);
    expect(paid.getTime()).toBe(before);
  });

  it('rejects a non-positive window', () => {
    expect(() => computeUnlockWindow(paid, 0)).toThrow(RangeError);
    expect(() => computeUnlockWindow(paid, -5)).toThrow(RangeError);
  });
});

describe('isUnlockActive — section 15 decision boundary', () => {
  const expires = new Date('2026-03-02T10:00:00.000Z');

  it('is active one millisecond before expiry', () => {
    expect(isUnlockActive(expires, new Date('2026-03-02T09:59:59.999Z'))).toBe(true);
  });

  it('is LOCKED at exactly the expiry instant', () => {
    // "if current_time < unlock_expires_at" — strict less-than, so equality is
    // already expired. This boundary is the whole point of server-side checks.
    expect(isUnlockActive(expires, new Date('2026-03-02T10:00:00.000Z'))).toBe(false);
  });

  it('is locked one millisecond after expiry', () => {
    expect(isUnlockActive(expires, new Date('2026-03-02T10:00:00.001Z'))).toBe(false);
  });

  it('is never active when the row is EXPIRED or REVOKED', () => {
    const wellBefore = new Date('2026-03-01T11:00:00.000Z');
    expect(isUnlockActive(expires, wellBefore, 'EXPIRED')).toBe(false);
    expect(isUnlockActive(expires, wellBefore, 'REVOKED')).toBe(false);
  });

  it('allows re-purchase after expiry (section 15)', () => {
    // A fresh unlock starts from a new payment time, not the old one.
    const later = new Date('2026-03-05T10:00:00.000Z');
    const second = computeUnlockWindow(later);
    expect(isUnlockActive(second.unlockExpiresAt, new Date('2026-03-05T11:00:00.000Z'))).toBe(true);
  });
});

describe('remainingMs', () => {
  it('floors at zero rather than going negative', () => {
    const exp = new Date('2026-03-02T10:00:00.000Z');
    expect(remainingMs(exp, new Date('2026-03-02T09:00:00.000Z'))).toBe(3_600_000);
    expect(remainingMs(exp, new Date('2026-03-03T10:00:00.000Z'))).toBe(0);
  });
});

/**
 * B1: a user may only ever discover profiles inside their own band, so getting
 * this function wrong is a privacy failure, not a pricing bug.
 */
describe('classifyNetWorth', () => {
  it('places values inside each band', () => {
    expect(classifyNetWorth(0n)).toBe('BELOW_2CR');
    expect(classifyNetWorth(19_999_999n)).toBe('BELOW_2CR');
    expect(classifyNetWorth(20_000_001n)).toBe('TWO_CR_TO_FIVE_CR');
    expect(classifyNetWorth(49_999_999n)).toBe('TWO_CR_TO_FIVE_CR');
    expect(classifyNetWorth(50_000_001n)).toBe('FIVE_CR_TO_TEN_CR');
    expect(classifyNetWorth(99_999_999n)).toBe('FIVE_CR_TO_TEN_CR');
    expect(classifyNetWorth(100_000_001n)).toBe('ABOVE_10CR');
  });

  it('assigns a value exactly on a boundary to the higher band', () => {
    // NOT a client decision. docs/decisions GAP-2 records that the client has
    // not said what should happen here. Pinned by this test so that, if the
    // answer changes to "route to admin review", the change is deliberate.
    expect(classifyNetWorth(2n * CR)).toBe('TWO_CR_TO_FIVE_CR');
    expect(classifyNetWorth(5n * CR)).toBe('FIVE_CR_TO_TEN_CR');
    expect(classifyNetWorth(10n * CR)).toBe('ABOVE_10CR');
  });

  it('rejects a negative net worth rather than defaulting it into a band', () => {
    expect(() => classifyNetWorth(-1n)).toThrow(RangeError);
  });

  it('leaves no gap between bands', () => {
    for (let i = 0n; i <= 12n * CR; i += 7_919n) {
      const key = classifyNetWorth(i);
      expect(key).not.toBe(NET_WORTH_PENDING_REVIEW_KEY);
    }
  });

  it('has contiguous, non-overlapping bounds', () => {
    const sorted = [...NET_WORTH_BANDS].sort((a, b) => Number((a.minInr ?? -1n) - (b.minInr ?? -1n)));
    expect(sorted[0]!.minInr).toBeNull();
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]!.minInr).toBe(sorted[i - 1]!.maxInr);
    }
    expect(sorted[sorted.length - 1]!.maxInr).toBeNull();
  });
});
