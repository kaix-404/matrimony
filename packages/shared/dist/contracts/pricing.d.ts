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
export declare const UnlockPriceQuoteSchema: z.ZodObject<{
    base_amount: z.ZodString;
    /**
     * A fraction, exactly as `quotePayment` returns it: "0.1800" is 18%. Every
     * other money field on the wire uses this form, and two spellings of the same
     * rate in one API is how a screen ends up showing 0.18% GST.
     */
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
export type UnlockPriceQuote = z.infer<typeof UnlockPriceQuoteSchema>;
export declare const PricingBandSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    /**
     * Null when the band has no active price. The screen hides that row rather
     * than showing a zero: a free unlock is not the same as an unpublished price.
     */
    unlock_price: z.ZodNullable<z.ZodObject<{
        base_amount: z.ZodString;
        /**
         * A fraction, exactly as `quotePayment` returns it: "0.1800" is 18%. Every
         * other money field on the wire uses this form, and two spellings of the same
         * rate in one API is how a screen ends up showing 0.18% GST.
         */
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
    }>>;
}, "strict", z.ZodTypeAny, {
    key: string;
    label: string;
    unlock_price: {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    } | null;
}, {
    key: string;
    label: string;
    unlock_price: {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    } | null;
}>;
export type PricingBand = z.infer<typeof PricingBandSchema>;
export declare const PricingScheduleSchema: z.ZodObject<{
    currency: z.ZodLiteral<"INR">;
    /** The one-time account setup fee, GST included. Charged once, at sign-up. */
    setup_fee: z.ZodObject<{
        base_amount: z.ZodString;
        /** Fraction, as above: "0.1800" is 18%. */
        gst_rate: z.ZodString;
        gst_amount: z.ZodString;
        total_amount: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
    }, {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
    }>;
    /** Only the bands that are offered for discovery, in the admin's order. */
    bands: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        /**
         * Null when the band has no active price. The screen hides that row rather
         * than showing a zero: a free unlock is not the same as an unpublished price.
         */
        unlock_price: z.ZodNullable<z.ZodObject<{
            base_amount: z.ZodString;
            /**
             * A fraction, exactly as `quotePayment` returns it: "0.1800" is 18%. Every
             * other money field on the wire uses this form, and two spellings of the same
             * rate in one API is how a screen ends up showing 0.18% GST.
             */
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
        }>>;
    }, "strict", z.ZodTypeAny, {
        key: string;
        label: string;
        unlock_price: {
            base_amount: string;
            gst_rate: string;
            gst_amount: string;
            total_amount: string;
            currency: "INR";
        } | null;
    }, {
        key: string;
        label: string;
        unlock_price: {
            base_amount: string;
            gst_rate: string;
            gst_amount: string;
            total_amount: string;
            currency: "INR";
        } | null;
    }>, "many">;
    generated_at: z.ZodString;
}, "strict", z.ZodTypeAny, {
    currency: "INR";
    setup_fee: {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
    };
    bands: {
        key: string;
        label: string;
        unlock_price: {
            base_amount: string;
            gst_rate: string;
            gst_amount: string;
            total_amount: string;
            currency: "INR";
        } | null;
    }[];
    generated_at: string;
}, {
    currency: "INR";
    setup_fee: {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
    };
    bands: {
        key: string;
        label: string;
        unlock_price: {
            base_amount: string;
            gst_rate: string;
            gst_amount: string;
            total_amount: string;
            currency: "INR";
        } | null;
    }[];
    generated_at: string;
}>;
export type PricingSchedule = z.infer<typeof PricingScheduleSchema>;
//# sourceMappingURL=pricing.d.ts.map