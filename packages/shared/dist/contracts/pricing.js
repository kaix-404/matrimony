"use strict";
/**
 * The published price list — what an unlock costs, per net-worth band.
 *
 * The client asked for a pricing page, and the numbers cannot be hardcoded in
 * the app: prices live in `PricingConfig` (an admin can change them, and every
 * past payment keeps the amount it was charged), while the setup fee lives on
 * the band rows. One endpoint answers both so the screen cannot show a band's
 * price from one source and its fee from another.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricingScheduleSchema = exports.PricingBandSchema = exports.UnlockPriceQuoteSchema = void 0;
const zod_1 = require("zod");
/** Whole rupees as decimal strings, like every other money field on the wire. */
const amount = zod_1.z.string().regex(/^\d+(\.\d{1,2})?$/);
exports.UnlockPriceQuoteSchema = zod_1.z
    .object({
    base_amount: amount,
    /**
     * A fraction, exactly as `quotePayment` returns it: "0.1800" is 18%. Every
     * other money field on the wire uses this form, and two spellings of the same
     * rate in one API is how a screen ends up showing 0.18% GST.
     */
    gst_rate: zod_1.z.string().regex(/^\d*\.?\d+$/),
    gst_amount: amount,
    total_amount: amount,
    currency: zod_1.z.literal('INR'),
})
    .strict();
exports.PricingBandSchema = zod_1.z
    .object({
    key: zod_1.z.string().min(1),
    label: zod_1.z.string().min(1),
    /**
     * Null when the band has no active price. The screen hides that row rather
     * than showing a zero: a free unlock is not the same as an unpublished price.
     */
    unlock_price: exports.UnlockPriceQuoteSchema.nullable(),
})
    .strict();
exports.PricingScheduleSchema = zod_1.z
    .object({
    currency: zod_1.z.literal('INR'),
    /** The one-time account setup fee, GST included. Charged once, at sign-up. */
    setup_fee: zod_1.z
        .object({
        base_amount: amount,
        /** Fraction, as above: "0.1800" is 18%. */
        gst_rate: zod_1.z.string().regex(/^\d*\.?\d+$/),
        gst_amount: amount,
        total_amount: amount,
    })
        .strict(),
    /** Only the bands that are offered for discovery, in the admin's order. */
    bands: zod_1.z.array(exports.PricingBandSchema),
    generated_at: zod_1.z.string(),
})
    .strict();
//# sourceMappingURL=pricing.js.map