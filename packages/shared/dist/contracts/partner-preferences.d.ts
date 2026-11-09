/**
 * The member's partner preferences — the "who would you like to meet" settings.
 *
 * Every field is optional except gender: an unset field means "no constraint",
 * which is why they are nullable rather than defaulted. Defaulting age or height
 * would quietly narrow a feed that the member never narrowed, and the member
 * would have no way to tell a small result set from a filter they did not set.
 *
 * This is the same row `PartnerPreference` that already carries the two-way
 * visibility flags. It is split into two contracts on purpose: visibility is
 * about exposure (who may see me), preferences are about the feed (whom I want
 * to see), and they are read by different screens.
 */
import { z } from 'zod';
/** The stored preference, as the screen reads and writes it. */
export declare const PartnerPreferenceValuesSchema: z.ZodEffects<z.ZodObject<{
    gender: z.ZodEnum<["MALE", "FEMALE", "ANY"]>;
    age_min: z.ZodNullable<z.ZodNumber>;
    age_max: z.ZodNullable<z.ZodNumber>;
    height_min_cm: z.ZodNullable<z.ZodNumber>;
    height_max_cm: z.ZodNullable<z.ZodNumber>;
    marital_status: z.ZodNullable<z.ZodEnum<["NEVER_MARRIED", "DIVORCED", "WIDOWED", "AWAITING_DIVORCE", "ANNULLED"]>>;
    religion: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    mother_tongue: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    /** ISO 3166-1 alpha-2, matching how profiles store a country. */
    country: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    state: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    city: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
}, "strict", z.ZodTypeAny, {
    gender: "MALE" | "FEMALE" | "ANY";
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    mother_tongue: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
}, {
    gender: "MALE" | "FEMALE" | "ANY";
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    mother_tongue: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
}>, {
    gender: "MALE" | "FEMALE" | "ANY";
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    mother_tongue: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
}, {
    gender: "MALE" | "FEMALE" | "ANY";
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    mother_tongue: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
}>;
export type PartnerPreferenceValues = z.infer<typeof PartnerPreferenceValuesSchema>;
/** `GET /me/partner-preference` — the saved values plus whether they were saved. */
export declare const PartnerPreferenceStateSchema: z.ZodObject<{
    preference: z.ZodEffects<z.ZodObject<{
        gender: z.ZodEnum<["MALE", "FEMALE", "ANY"]>;
        age_min: z.ZodNullable<z.ZodNumber>;
        age_max: z.ZodNullable<z.ZodNumber>;
        height_min_cm: z.ZodNullable<z.ZodNumber>;
        height_max_cm: z.ZodNullable<z.ZodNumber>;
        marital_status: z.ZodNullable<z.ZodEnum<["NEVER_MARRIED", "DIVORCED", "WIDOWED", "AWAITING_DIVORCE", "ANNULLED"]>>;
        religion: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
        mother_tongue: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
        /** ISO 3166-1 alpha-2, matching how profiles store a country. */
        country: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
        state: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
        city: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    }, "strict", z.ZodTypeAny, {
        gender: "MALE" | "FEMALE" | "ANY";
        age_min: number | null;
        age_max: number | null;
        height_min_cm: number | null;
        height_max_cm: number | null;
        marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
        religion: string | null;
        mother_tongue: string | null;
        country: string | null;
        state: string | null;
        city: string | null;
    }, {
        gender: "MALE" | "FEMALE" | "ANY";
        age_min: number | null;
        age_max: number | null;
        height_min_cm: number | null;
        height_max_cm: number | null;
        marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
        religion: string | null;
        mother_tongue: string | null;
        country: string | null;
        state: string | null;
        city: string | null;
    }>, {
        gender: "MALE" | "FEMALE" | "ANY";
        age_min: number | null;
        age_max: number | null;
        height_min_cm: number | null;
        height_max_cm: number | null;
        marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
        religion: string | null;
        mother_tongue: string | null;
        country: string | null;
        state: string | null;
        city: string | null;
    }, {
        gender: "MALE" | "FEMALE" | "ANY";
        age_min: number | null;
        age_max: number | null;
        height_min_cm: number | null;
        height_max_cm: number | null;
        marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
        religion: string | null;
        mother_tongue: string | null;
        country: string | null;
        state: string | null;
        city: string | null;
    }>;
    /** False until the member saves for the first time. */
    configured: z.ZodBoolean;
    updated_at: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    preference: {
        gender: "MALE" | "FEMALE" | "ANY";
        age_min: number | null;
        age_max: number | null;
        height_min_cm: number | null;
        height_max_cm: number | null;
        marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
        religion: string | null;
        mother_tongue: string | null;
        country: string | null;
        state: string | null;
        city: string | null;
    };
    configured: boolean;
    updated_at: string | null;
}, {
    preference: {
        gender: "MALE" | "FEMALE" | "ANY";
        age_min: number | null;
        age_max: number | null;
        height_min_cm: number | null;
        height_max_cm: number | null;
        marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
        religion: string | null;
        mother_tongue: string | null;
        country: string | null;
        state: string | null;
        city: string | null;
    };
    configured: boolean;
    updated_at: string | null;
}>;
export type PartnerPreferenceState = z.infer<typeof PartnerPreferenceStateSchema>;
/**
 * `PUT /me/partner-preference` — the whole form.
 *
 * Whole-resource replacement is right here, unlike the visibility lists: this
 * screen always submits every field, and clearing a field is an edit a member
 * expects to stick. A partial update would make "remove the religion filter"
 * indistinguishable from "did not mention religion".
 */
export declare const UpdatePartnerPreferenceSchema: z.ZodEffects<z.ZodObject<{
    gender: z.ZodEnum<["MALE", "FEMALE", "ANY"]>;
    age_min: z.ZodNullable<z.ZodNumber>;
    age_max: z.ZodNullable<z.ZodNumber>;
    height_min_cm: z.ZodNullable<z.ZodNumber>;
    height_max_cm: z.ZodNullable<z.ZodNumber>;
    marital_status: z.ZodNullable<z.ZodEnum<["NEVER_MARRIED", "DIVORCED", "WIDOWED", "AWAITING_DIVORCE", "ANNULLED"]>>;
    religion: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    mother_tongue: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    /** ISO 3166-1 alpha-2, matching how profiles store a country. */
    country: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    state: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    city: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
}, "strict", z.ZodTypeAny, {
    gender: "MALE" | "FEMALE" | "ANY";
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    mother_tongue: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
}, {
    gender: "MALE" | "FEMALE" | "ANY";
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    mother_tongue: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
}>, {
    gender: "MALE" | "FEMALE" | "ANY";
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    mother_tongue: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
}, {
    gender: "MALE" | "FEMALE" | "ANY";
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    mother_tongue: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
}>;
export type UpdatePartnerPreferenceInput = z.infer<typeof UpdatePartnerPreferenceSchema>;
/** What has been saved, regardless of whether it narrows anything today. */
export declare function hasPartnerPreferenceConstraints(preference: PartnerPreferenceValues): boolean;
//# sourceMappingURL=partner-preferences.d.ts.map