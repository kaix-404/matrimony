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
 *
 * COMPULSORY FILTERS
 * ------------------
 * The client's reference puts a "Compulsory" tick beside each preference: a
 * ticked preference is a hard filter, and the page warns that turning it on is
 * what makes matches drop away. `compulsory` names the fields that carry a tick,
 * so the screen can render the state and the feed can tell a hard filter from a
 * merely-stated preference.
 */
import { z } from 'zod';
/**
 * Every preference a member can tick as compulsory.
 *
 * Named for the question rather than the column, because the tick is a product
 * concept and the columns have changed names before: `eating` is stored in
 * `foodPreference` and `occupation` in `professionId`.
 */
export declare const PREFERENCE_FILTER_KEYS: readonly ["gender", "age", "height", "marital_status", "religion", "sub_caste", "mother_tongue", "physical_status", "eating", "drinking", "smoking", "kuja_dosham", "education", "employed_in", "occupation", "annual_income", "country", "state", "city"];
export type PreferenceFilterKey = (typeof PREFERENCE_FILTER_KEYS)[number];
/** The stored preference, as the screen reads and writes it. */
export declare const PartnerPreferenceValuesSchema: z.ZodEffects<z.ZodObject<{
    gender: z.ZodEnum<["MALE", "FEMALE", "ANY"]>;
    age_min: z.ZodNullable<z.ZodNumber>;
    age_max: z.ZodNullable<z.ZodNumber>;
    height_min_cm: z.ZodNullable<z.ZodNumber>;
    height_max_cm: z.ZodNullable<z.ZodNumber>;
    marital_status: z.ZodNullable<z.ZodEnum<["NEVER_MARRIED", "DIVORCED", "WIDOWED", "AWAITING_DIVORCE", "ANNULLED"]>>;
    religion: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    /** Religion-scoped sub-caste, matched against the profile's `sub_caste`. */
    sub_caste: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    /** Master-list ids from `EDUCATION` and `PROFESSION`. */
    education_id: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    /** The client calls this "Occupation"; it is the profile's `professionId`. */
    profession_id: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    mother_tongue: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    /** ISO 3166-1 alpha-2, matching how profiles store a country. */
    country: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    state: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    city: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    physical_status: z.ZodArray<z.ZodEnum<["NORMAL", "PHYSICALLY_CHALLENGED"]>, "many">;
    eating_habits: z.ZodArray<z.ZodEnum<["Vegetarian", "Non-vegetarian", "Eggetarian", "Vegan"]>, "many">;
    drinking_habits: z.ZodArray<z.ZodEnum<["Non-drinker", "Light drinker", "Social drinker", "Regular drinker"]>, "many">;
    smoking_habits: z.ZodArray<z.ZodEnum<["Non-smoker", "Light smoker", "Social smoker", "Regular smoker"]>, "many">;
    kuja_dosham: z.ZodArray<z.ZodEnum<["YES", "NO", "DONT_KNOW"]>, "many">;
    employed_in: z.ZodArray<z.ZodEnum<["Government", "Private", "Business", "Self-employed", "Not working"]>, "many">;
    annual_income_bands: z.ZodArray<z.ZodEnum<["Below ₹5 lakh", "₹5-10 lakh", "₹10-20 lakh", "₹20-35 lakh", "₹35-50 lakh", "Above ₹50 lakh"]>, "many">;
    /** The preferences this member wants applied as hard filters. */
    compulsory: z.ZodArray<z.ZodEnum<["gender", "age", "height", "marital_status", "religion", "sub_caste", "mother_tongue", "physical_status", "eating", "drinking", "smoking", "kuja_dosham", "education", "employed_in", "occupation", "annual_income", "country", "state", "city"]>, "many">;
}, "strict", z.ZodTypeAny, {
    gender: "MALE" | "FEMALE" | "ANY";
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    sub_caste: string | null;
    mother_tongue: string | null;
    education_id: string | null;
    profession_id: string | null;
    employed_in: ("Government" | "Private" | "Business" | "Self-employed" | "Not working")[];
    physical_status: ("NORMAL" | "PHYSICALLY_CHALLENGED")[];
    country: string | null;
    state: string | null;
    city: string | null;
    kuja_dosham: ("YES" | "NO" | "DONT_KNOW")[];
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    eating_habits: ("Vegetarian" | "Non-vegetarian" | "Eggetarian" | "Vegan")[];
    drinking_habits: ("Non-drinker" | "Light drinker" | "Social drinker" | "Regular drinker")[];
    smoking_habits: ("Non-smoker" | "Light smoker" | "Social smoker" | "Regular smoker")[];
    annual_income_bands: ("Below ₹5 lakh" | "₹5-10 lakh" | "₹10-20 lakh" | "₹20-35 lakh" | "₹35-50 lakh" | "Above ₹50 lakh")[];
    compulsory: ("gender" | "marital_status" | "religion" | "sub_caste" | "mother_tongue" | "annual_income" | "smoking" | "drinking" | "employed_in" | "physical_status" | "country" | "state" | "city" | "education" | "age" | "height" | "eating" | "kuja_dosham" | "occupation")[];
}, {
    gender: "MALE" | "FEMALE" | "ANY";
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    sub_caste: string | null;
    mother_tongue: string | null;
    education_id: string | null;
    profession_id: string | null;
    employed_in: ("Government" | "Private" | "Business" | "Self-employed" | "Not working")[];
    physical_status: ("NORMAL" | "PHYSICALLY_CHALLENGED")[];
    country: string | null;
    state: string | null;
    city: string | null;
    kuja_dosham: ("YES" | "NO" | "DONT_KNOW")[];
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    eating_habits: ("Vegetarian" | "Non-vegetarian" | "Eggetarian" | "Vegan")[];
    drinking_habits: ("Non-drinker" | "Light drinker" | "Social drinker" | "Regular drinker")[];
    smoking_habits: ("Non-smoker" | "Light smoker" | "Social smoker" | "Regular smoker")[];
    annual_income_bands: ("Below ₹5 lakh" | "₹5-10 lakh" | "₹10-20 lakh" | "₹20-35 lakh" | "₹35-50 lakh" | "Above ₹50 lakh")[];
    compulsory: ("gender" | "marital_status" | "religion" | "sub_caste" | "mother_tongue" | "annual_income" | "smoking" | "drinking" | "employed_in" | "physical_status" | "country" | "state" | "city" | "education" | "age" | "height" | "eating" | "kuja_dosham" | "occupation")[];
}>, {
    gender: "MALE" | "FEMALE" | "ANY";
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    sub_caste: string | null;
    mother_tongue: string | null;
    education_id: string | null;
    profession_id: string | null;
    employed_in: ("Government" | "Private" | "Business" | "Self-employed" | "Not working")[];
    physical_status: ("NORMAL" | "PHYSICALLY_CHALLENGED")[];
    country: string | null;
    state: string | null;
    city: string | null;
    kuja_dosham: ("YES" | "NO" | "DONT_KNOW")[];
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    eating_habits: ("Vegetarian" | "Non-vegetarian" | "Eggetarian" | "Vegan")[];
    drinking_habits: ("Non-drinker" | "Light drinker" | "Social drinker" | "Regular drinker")[];
    smoking_habits: ("Non-smoker" | "Light smoker" | "Social smoker" | "Regular smoker")[];
    annual_income_bands: ("Below ₹5 lakh" | "₹5-10 lakh" | "₹10-20 lakh" | "₹20-35 lakh" | "₹35-50 lakh" | "Above ₹50 lakh")[];
    compulsory: ("gender" | "marital_status" | "religion" | "sub_caste" | "mother_tongue" | "annual_income" | "smoking" | "drinking" | "employed_in" | "physical_status" | "country" | "state" | "city" | "education" | "age" | "height" | "eating" | "kuja_dosham" | "occupation")[];
}, {
    gender: "MALE" | "FEMALE" | "ANY";
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    sub_caste: string | null;
    mother_tongue: string | null;
    education_id: string | null;
    profession_id: string | null;
    employed_in: ("Government" | "Private" | "Business" | "Self-employed" | "Not working")[];
    physical_status: ("NORMAL" | "PHYSICALLY_CHALLENGED")[];
    country: string | null;
    state: string | null;
    city: string | null;
    kuja_dosham: ("YES" | "NO" | "DONT_KNOW")[];
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    eating_habits: ("Vegetarian" | "Non-vegetarian" | "Eggetarian" | "Vegan")[];
    drinking_habits: ("Non-drinker" | "Light drinker" | "Social drinker" | "Regular drinker")[];
    smoking_habits: ("Non-smoker" | "Light smoker" | "Social smoker" | "Regular smoker")[];
    annual_income_bands: ("Below ₹5 lakh" | "₹5-10 lakh" | "₹10-20 lakh" | "₹20-35 lakh" | "₹35-50 lakh" | "Above ₹50 lakh")[];
    compulsory: ("gender" | "marital_status" | "religion" | "sub_caste" | "mother_tongue" | "annual_income" | "smoking" | "drinking" | "employed_in" | "physical_status" | "country" | "state" | "city" | "education" | "age" | "height" | "eating" | "kuja_dosham" | "occupation")[];
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
        /** Religion-scoped sub-caste, matched against the profile's `sub_caste`. */
        sub_caste: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
        /** Master-list ids from `EDUCATION` and `PROFESSION`. */
        education_id: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
        /** The client calls this "Occupation"; it is the profile's `professionId`. */
        profession_id: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
        mother_tongue: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
        /** ISO 3166-1 alpha-2, matching how profiles store a country. */
        country: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
        state: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
        city: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
        physical_status: z.ZodArray<z.ZodEnum<["NORMAL", "PHYSICALLY_CHALLENGED"]>, "many">;
        eating_habits: z.ZodArray<z.ZodEnum<["Vegetarian", "Non-vegetarian", "Eggetarian", "Vegan"]>, "many">;
        drinking_habits: z.ZodArray<z.ZodEnum<["Non-drinker", "Light drinker", "Social drinker", "Regular drinker"]>, "many">;
        smoking_habits: z.ZodArray<z.ZodEnum<["Non-smoker", "Light smoker", "Social smoker", "Regular smoker"]>, "many">;
        kuja_dosham: z.ZodArray<z.ZodEnum<["YES", "NO", "DONT_KNOW"]>, "many">;
        employed_in: z.ZodArray<z.ZodEnum<["Government", "Private", "Business", "Self-employed", "Not working"]>, "many">;
        annual_income_bands: z.ZodArray<z.ZodEnum<["Below ₹5 lakh", "₹5-10 lakh", "₹10-20 lakh", "₹20-35 lakh", "₹35-50 lakh", "Above ₹50 lakh"]>, "many">;
        /** The preferences this member wants applied as hard filters. */
        compulsory: z.ZodArray<z.ZodEnum<["gender", "age", "height", "marital_status", "religion", "sub_caste", "mother_tongue", "physical_status", "eating", "drinking", "smoking", "kuja_dosham", "education", "employed_in", "occupation", "annual_income", "country", "state", "city"]>, "many">;
    }, "strict", z.ZodTypeAny, {
        gender: "MALE" | "FEMALE" | "ANY";
        marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
        religion: string | null;
        sub_caste: string | null;
        mother_tongue: string | null;
        education_id: string | null;
        profession_id: string | null;
        employed_in: ("Government" | "Private" | "Business" | "Self-employed" | "Not working")[];
        physical_status: ("NORMAL" | "PHYSICALLY_CHALLENGED")[];
        country: string | null;
        state: string | null;
        city: string | null;
        kuja_dosham: ("YES" | "NO" | "DONT_KNOW")[];
        age_min: number | null;
        age_max: number | null;
        height_min_cm: number | null;
        height_max_cm: number | null;
        eating_habits: ("Vegetarian" | "Non-vegetarian" | "Eggetarian" | "Vegan")[];
        drinking_habits: ("Non-drinker" | "Light drinker" | "Social drinker" | "Regular drinker")[];
        smoking_habits: ("Non-smoker" | "Light smoker" | "Social smoker" | "Regular smoker")[];
        annual_income_bands: ("Below ₹5 lakh" | "₹5-10 lakh" | "₹10-20 lakh" | "₹20-35 lakh" | "₹35-50 lakh" | "Above ₹50 lakh")[];
        compulsory: ("gender" | "marital_status" | "religion" | "sub_caste" | "mother_tongue" | "annual_income" | "smoking" | "drinking" | "employed_in" | "physical_status" | "country" | "state" | "city" | "education" | "age" | "height" | "eating" | "kuja_dosham" | "occupation")[];
    }, {
        gender: "MALE" | "FEMALE" | "ANY";
        marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
        religion: string | null;
        sub_caste: string | null;
        mother_tongue: string | null;
        education_id: string | null;
        profession_id: string | null;
        employed_in: ("Government" | "Private" | "Business" | "Self-employed" | "Not working")[];
        physical_status: ("NORMAL" | "PHYSICALLY_CHALLENGED")[];
        country: string | null;
        state: string | null;
        city: string | null;
        kuja_dosham: ("YES" | "NO" | "DONT_KNOW")[];
        age_min: number | null;
        age_max: number | null;
        height_min_cm: number | null;
        height_max_cm: number | null;
        eating_habits: ("Vegetarian" | "Non-vegetarian" | "Eggetarian" | "Vegan")[];
        drinking_habits: ("Non-drinker" | "Light drinker" | "Social drinker" | "Regular drinker")[];
        smoking_habits: ("Non-smoker" | "Light smoker" | "Social smoker" | "Regular smoker")[];
        annual_income_bands: ("Below ₹5 lakh" | "₹5-10 lakh" | "₹10-20 lakh" | "₹20-35 lakh" | "₹35-50 lakh" | "Above ₹50 lakh")[];
        compulsory: ("gender" | "marital_status" | "religion" | "sub_caste" | "mother_tongue" | "annual_income" | "smoking" | "drinking" | "employed_in" | "physical_status" | "country" | "state" | "city" | "education" | "age" | "height" | "eating" | "kuja_dosham" | "occupation")[];
    }>, {
        gender: "MALE" | "FEMALE" | "ANY";
        marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
        religion: string | null;
        sub_caste: string | null;
        mother_tongue: string | null;
        education_id: string | null;
        profession_id: string | null;
        employed_in: ("Government" | "Private" | "Business" | "Self-employed" | "Not working")[];
        physical_status: ("NORMAL" | "PHYSICALLY_CHALLENGED")[];
        country: string | null;
        state: string | null;
        city: string | null;
        kuja_dosham: ("YES" | "NO" | "DONT_KNOW")[];
        age_min: number | null;
        age_max: number | null;
        height_min_cm: number | null;
        height_max_cm: number | null;
        eating_habits: ("Vegetarian" | "Non-vegetarian" | "Eggetarian" | "Vegan")[];
        drinking_habits: ("Non-drinker" | "Light drinker" | "Social drinker" | "Regular drinker")[];
        smoking_habits: ("Non-smoker" | "Light smoker" | "Social smoker" | "Regular smoker")[];
        annual_income_bands: ("Below ₹5 lakh" | "₹5-10 lakh" | "₹10-20 lakh" | "₹20-35 lakh" | "₹35-50 lakh" | "Above ₹50 lakh")[];
        compulsory: ("gender" | "marital_status" | "religion" | "sub_caste" | "mother_tongue" | "annual_income" | "smoking" | "drinking" | "employed_in" | "physical_status" | "country" | "state" | "city" | "education" | "age" | "height" | "eating" | "kuja_dosham" | "occupation")[];
    }, {
        gender: "MALE" | "FEMALE" | "ANY";
        marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
        religion: string | null;
        sub_caste: string | null;
        mother_tongue: string | null;
        education_id: string | null;
        profession_id: string | null;
        employed_in: ("Government" | "Private" | "Business" | "Self-employed" | "Not working")[];
        physical_status: ("NORMAL" | "PHYSICALLY_CHALLENGED")[];
        country: string | null;
        state: string | null;
        city: string | null;
        kuja_dosham: ("YES" | "NO" | "DONT_KNOW")[];
        age_min: number | null;
        age_max: number | null;
        height_min_cm: number | null;
        height_max_cm: number | null;
        eating_habits: ("Vegetarian" | "Non-vegetarian" | "Eggetarian" | "Vegan")[];
        drinking_habits: ("Non-drinker" | "Light drinker" | "Social drinker" | "Regular drinker")[];
        smoking_habits: ("Non-smoker" | "Light smoker" | "Social smoker" | "Regular smoker")[];
        annual_income_bands: ("Below ₹5 lakh" | "₹5-10 lakh" | "₹10-20 lakh" | "₹20-35 lakh" | "₹35-50 lakh" | "Above ₹50 lakh")[];
        compulsory: ("gender" | "marital_status" | "religion" | "sub_caste" | "mother_tongue" | "annual_income" | "smoking" | "drinking" | "employed_in" | "physical_status" | "country" | "state" | "city" | "education" | "age" | "height" | "eating" | "kuja_dosham" | "occupation")[];
    }>;
    /** False until the member saves for the first time. */
    configured: z.ZodBoolean;
    updated_at: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    preference: {
        gender: "MALE" | "FEMALE" | "ANY";
        marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
        religion: string | null;
        sub_caste: string | null;
        mother_tongue: string | null;
        education_id: string | null;
        profession_id: string | null;
        employed_in: ("Government" | "Private" | "Business" | "Self-employed" | "Not working")[];
        physical_status: ("NORMAL" | "PHYSICALLY_CHALLENGED")[];
        country: string | null;
        state: string | null;
        city: string | null;
        kuja_dosham: ("YES" | "NO" | "DONT_KNOW")[];
        age_min: number | null;
        age_max: number | null;
        height_min_cm: number | null;
        height_max_cm: number | null;
        eating_habits: ("Vegetarian" | "Non-vegetarian" | "Eggetarian" | "Vegan")[];
        drinking_habits: ("Non-drinker" | "Light drinker" | "Social drinker" | "Regular drinker")[];
        smoking_habits: ("Non-smoker" | "Light smoker" | "Social smoker" | "Regular smoker")[];
        annual_income_bands: ("Below ₹5 lakh" | "₹5-10 lakh" | "₹10-20 lakh" | "₹20-35 lakh" | "₹35-50 lakh" | "Above ₹50 lakh")[];
        compulsory: ("gender" | "marital_status" | "religion" | "sub_caste" | "mother_tongue" | "annual_income" | "smoking" | "drinking" | "employed_in" | "physical_status" | "country" | "state" | "city" | "education" | "age" | "height" | "eating" | "kuja_dosham" | "occupation")[];
    };
    configured: boolean;
    updated_at: string | null;
}, {
    preference: {
        gender: "MALE" | "FEMALE" | "ANY";
        marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
        religion: string | null;
        sub_caste: string | null;
        mother_tongue: string | null;
        education_id: string | null;
        profession_id: string | null;
        employed_in: ("Government" | "Private" | "Business" | "Self-employed" | "Not working")[];
        physical_status: ("NORMAL" | "PHYSICALLY_CHALLENGED")[];
        country: string | null;
        state: string | null;
        city: string | null;
        kuja_dosham: ("YES" | "NO" | "DONT_KNOW")[];
        age_min: number | null;
        age_max: number | null;
        height_min_cm: number | null;
        height_max_cm: number | null;
        eating_habits: ("Vegetarian" | "Non-vegetarian" | "Eggetarian" | "Vegan")[];
        drinking_habits: ("Non-drinker" | "Light drinker" | "Social drinker" | "Regular drinker")[];
        smoking_habits: ("Non-smoker" | "Light smoker" | "Social smoker" | "Regular smoker")[];
        annual_income_bands: ("Below ₹5 lakh" | "₹5-10 lakh" | "₹10-20 lakh" | "₹20-35 lakh" | "₹35-50 lakh" | "Above ₹50 lakh")[];
        compulsory: ("gender" | "marital_status" | "religion" | "sub_caste" | "mother_tongue" | "annual_income" | "smoking" | "drinking" | "employed_in" | "physical_status" | "country" | "state" | "city" | "education" | "age" | "height" | "eating" | "kuja_dosham" | "occupation")[];
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
    /** Religion-scoped sub-caste, matched against the profile's `sub_caste`. */
    sub_caste: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    /** Master-list ids from `EDUCATION` and `PROFESSION`. */
    education_id: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    /** The client calls this "Occupation"; it is the profile's `professionId`. */
    profession_id: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    mother_tongue: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    /** ISO 3166-1 alpha-2, matching how profiles store a country. */
    country: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    state: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    city: z.ZodEffects<z.ZodNullable<z.ZodString>, string | null, string | null>;
    physical_status: z.ZodArray<z.ZodEnum<["NORMAL", "PHYSICALLY_CHALLENGED"]>, "many">;
    eating_habits: z.ZodArray<z.ZodEnum<["Vegetarian", "Non-vegetarian", "Eggetarian", "Vegan"]>, "many">;
    drinking_habits: z.ZodArray<z.ZodEnum<["Non-drinker", "Light drinker", "Social drinker", "Regular drinker"]>, "many">;
    smoking_habits: z.ZodArray<z.ZodEnum<["Non-smoker", "Light smoker", "Social smoker", "Regular smoker"]>, "many">;
    kuja_dosham: z.ZodArray<z.ZodEnum<["YES", "NO", "DONT_KNOW"]>, "many">;
    employed_in: z.ZodArray<z.ZodEnum<["Government", "Private", "Business", "Self-employed", "Not working"]>, "many">;
    annual_income_bands: z.ZodArray<z.ZodEnum<["Below ₹5 lakh", "₹5-10 lakh", "₹10-20 lakh", "₹20-35 lakh", "₹35-50 lakh", "Above ₹50 lakh"]>, "many">;
    /** The preferences this member wants applied as hard filters. */
    compulsory: z.ZodArray<z.ZodEnum<["gender", "age", "height", "marital_status", "religion", "sub_caste", "mother_tongue", "physical_status", "eating", "drinking", "smoking", "kuja_dosham", "education", "employed_in", "occupation", "annual_income", "country", "state", "city"]>, "many">;
}, "strict", z.ZodTypeAny, {
    gender: "MALE" | "FEMALE" | "ANY";
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    sub_caste: string | null;
    mother_tongue: string | null;
    education_id: string | null;
    profession_id: string | null;
    employed_in: ("Government" | "Private" | "Business" | "Self-employed" | "Not working")[];
    physical_status: ("NORMAL" | "PHYSICALLY_CHALLENGED")[];
    country: string | null;
    state: string | null;
    city: string | null;
    kuja_dosham: ("YES" | "NO" | "DONT_KNOW")[];
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    eating_habits: ("Vegetarian" | "Non-vegetarian" | "Eggetarian" | "Vegan")[];
    drinking_habits: ("Non-drinker" | "Light drinker" | "Social drinker" | "Regular drinker")[];
    smoking_habits: ("Non-smoker" | "Light smoker" | "Social smoker" | "Regular smoker")[];
    annual_income_bands: ("Below ₹5 lakh" | "₹5-10 lakh" | "₹10-20 lakh" | "₹20-35 lakh" | "₹35-50 lakh" | "Above ₹50 lakh")[];
    compulsory: ("gender" | "marital_status" | "religion" | "sub_caste" | "mother_tongue" | "annual_income" | "smoking" | "drinking" | "employed_in" | "physical_status" | "country" | "state" | "city" | "education" | "age" | "height" | "eating" | "kuja_dosham" | "occupation")[];
}, {
    gender: "MALE" | "FEMALE" | "ANY";
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    sub_caste: string | null;
    mother_tongue: string | null;
    education_id: string | null;
    profession_id: string | null;
    employed_in: ("Government" | "Private" | "Business" | "Self-employed" | "Not working")[];
    physical_status: ("NORMAL" | "PHYSICALLY_CHALLENGED")[];
    country: string | null;
    state: string | null;
    city: string | null;
    kuja_dosham: ("YES" | "NO" | "DONT_KNOW")[];
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    eating_habits: ("Vegetarian" | "Non-vegetarian" | "Eggetarian" | "Vegan")[];
    drinking_habits: ("Non-drinker" | "Light drinker" | "Social drinker" | "Regular drinker")[];
    smoking_habits: ("Non-smoker" | "Light smoker" | "Social smoker" | "Regular smoker")[];
    annual_income_bands: ("Below ₹5 lakh" | "₹5-10 lakh" | "₹10-20 lakh" | "₹20-35 lakh" | "₹35-50 lakh" | "Above ₹50 lakh")[];
    compulsory: ("gender" | "marital_status" | "religion" | "sub_caste" | "mother_tongue" | "annual_income" | "smoking" | "drinking" | "employed_in" | "physical_status" | "country" | "state" | "city" | "education" | "age" | "height" | "eating" | "kuja_dosham" | "occupation")[];
}>, {
    gender: "MALE" | "FEMALE" | "ANY";
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    sub_caste: string | null;
    mother_tongue: string | null;
    education_id: string | null;
    profession_id: string | null;
    employed_in: ("Government" | "Private" | "Business" | "Self-employed" | "Not working")[];
    physical_status: ("NORMAL" | "PHYSICALLY_CHALLENGED")[];
    country: string | null;
    state: string | null;
    city: string | null;
    kuja_dosham: ("YES" | "NO" | "DONT_KNOW")[];
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    eating_habits: ("Vegetarian" | "Non-vegetarian" | "Eggetarian" | "Vegan")[];
    drinking_habits: ("Non-drinker" | "Light drinker" | "Social drinker" | "Regular drinker")[];
    smoking_habits: ("Non-smoker" | "Light smoker" | "Social smoker" | "Regular smoker")[];
    annual_income_bands: ("Below ₹5 lakh" | "₹5-10 lakh" | "₹10-20 lakh" | "₹20-35 lakh" | "₹35-50 lakh" | "Above ₹50 lakh")[];
    compulsory: ("gender" | "marital_status" | "religion" | "sub_caste" | "mother_tongue" | "annual_income" | "smoking" | "drinking" | "employed_in" | "physical_status" | "country" | "state" | "city" | "education" | "age" | "height" | "eating" | "kuja_dosham" | "occupation")[];
}, {
    gender: "MALE" | "FEMALE" | "ANY";
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    sub_caste: string | null;
    mother_tongue: string | null;
    education_id: string | null;
    profession_id: string | null;
    employed_in: ("Government" | "Private" | "Business" | "Self-employed" | "Not working")[];
    physical_status: ("NORMAL" | "PHYSICALLY_CHALLENGED")[];
    country: string | null;
    state: string | null;
    city: string | null;
    kuja_dosham: ("YES" | "NO" | "DONT_KNOW")[];
    age_min: number | null;
    age_max: number | null;
    height_min_cm: number | null;
    height_max_cm: number | null;
    eating_habits: ("Vegetarian" | "Non-vegetarian" | "Eggetarian" | "Vegan")[];
    drinking_habits: ("Non-drinker" | "Light drinker" | "Social drinker" | "Regular drinker")[];
    smoking_habits: ("Non-smoker" | "Light smoker" | "Social smoker" | "Regular smoker")[];
    annual_income_bands: ("Below ₹5 lakh" | "₹5-10 lakh" | "₹10-20 lakh" | "₹20-35 lakh" | "₹35-50 lakh" | "Above ₹50 lakh")[];
    compulsory: ("gender" | "marital_status" | "religion" | "sub_caste" | "mother_tongue" | "annual_income" | "smoking" | "drinking" | "employed_in" | "physical_status" | "country" | "state" | "city" | "education" | "age" | "height" | "eating" | "kuja_dosham" | "occupation")[];
}>;
export type UpdatePartnerPreferenceInput = z.infer<typeof UpdatePartnerPreferenceSchema>;
/**
 * What has been saved, regardless of whether it narrows anything today.
 *
 * The compulsory list is not counted: a tick with nothing to apply underneath it
 * does not narrow a feed, and reporting it as a constraint would claim the member
 * had restricted something they had not.
 */
export declare function hasPartnerPreferenceConstraints(preference: PartnerPreferenceValues): boolean;
//# sourceMappingURL=partner-preferences.d.ts.map