/**
 * The published price list — what an unlock costs, per net-worth band.
 *
 * The client asked for a pricing page, and the numbers cannot be hardcoded in
 * the app: prices live in `PricingConfig` (an admin can change them, and every
 * past payment keeps the amount it was charged), while the setup fee lives on
 * the band rows. One endpoint answers both so the screen cannot show a band's
 * price from one source and its fee from another.
 */

import { z } from 'zod';

/** Whole rupees as decimal strings, like every other money field on the wire. */
const amount = z.string().regex(/^\d+(\.\d{1,2})?$/);

export const UnlockPriceQuoteSchema = z
  .object({
    base_amount: amount,
    /**
     * A fraction, exactly as `quotePayment` returns it: "0.1800" is 18%. Every
     * other money field on the wire uses this form, and two spellings of the same
     * rate in one API is how a screen ends up showing 0.18% GST.
     */
    gst_rate: z.string().regex(/^\d*\.?\d+$/),
    gst_amount: amount,
    total_amount: amount,
    currency: z.literal('INR'),
  })
  .strict();

export type UnlockPriceQuote = z.infer<typeof UnlockPriceQuoteSchema>;

export const PricingBandSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    /**
     * Null when the band has no active price. The screen hides that row rather
     * than showing a zero: a free unlock is not the same as an unpublished price.
     */
    unlock_price: UnlockPriceQuoteSchema.nullable(),
  })
  .strict();

export type PricingBand = z.infer<typeof PricingBandSchema>;

export const PricingScheduleSchema = z
  .object({
    currency: z.literal('INR'),
    /** The one-time account setup fee, GST included. Charged once, at sign-up. */
    setup_fee: z
      .object({
        base_amount: amount,
        /** Fraction, as above: "0.1800" is 18%. */
        gst_rate: z.string().regex(/^\d*\.?\d+$/),
        gst_amount: amount,
        total_amount: amount,
      })
      .strict(),
    /** Only the bands that are offered for discovery, in the admin's order. */
    bands: z.array(PricingBandSchema),
    generated_at: z.string(),
  })
  .strict();

export type PricingSchedule = z.infer<typeof PricingScheduleSchema>;
