/**
 * Profile visibility contracts — spec sections 13, 38, 39.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Section 13 states hidden fields "must not be sent to the app", and section 38
 * adds that they "must not contain hidden fields under alternative JSON keys,
 * nested objects or metadata". A blurred UI is explicitly not acceptable
 * (section 46: "Do not send information to the mobile app unless the user is
 * authorized to see it").
 *
 * The practical way to make that guarantee is to define the wire format as a
 * closed schema and validate responses against it. Every schema below is
 * `.strict()`, so an accidental `{ ...profile }` spread that leaks a field
 * fails type-checking in CI and fails validation at runtime. There is no code
 * path that can widen these shapes without changing this file.
 *
 * Section 41 adds "profile enumeration protection" — a strict schema also
 * guarantees the response cannot become a harvest vector.
 */
import { z } from 'zod';
/**
 * Only APPROVED photos reach another user (section 9), and photos are never
 * locked behind payment (section 9: "Photos are not locked behind payment").
 * The object key is never exposed; the server issues short-lived presigned URLs.
 */
export declare const PreviewPhotoSchema: z.ZodObject<{
    photo_id: z.ZodString;
    url: z.ZodString;
    width_px: z.ZodNullable<z.ZodNumber>;
    height_px: z.ZodNullable<z.ZodNumber>;
    is_primary: z.ZodBoolean;
    photo_type: z.ZodEnum<["SINGLE", "FAMILY"]>;
}, "strict", z.ZodTypeAny, {
    photo_id: string;
    url: string;
    width_px: number | null;
    height_px: number | null;
    is_primary: boolean;
    photo_type: "SINGLE" | "FAMILY";
}, {
    photo_id: string;
    url: string;
    width_px: number | null;
    height_px: number | null;
    is_primary: boolean;
    photo_type: "SINGLE" | "FAMILY";
}>;
export type PreviewPhoto = z.infer<typeof PreviewPhotoSchema>;
export declare const UnlockPriceSchema: z.ZodObject<{
    base_amount: z.ZodString;
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
export type UnlockPrice = z.infer<typeof UnlockPriceSchema>;
/**
 * The complete set of fields a user may see before paying. Section 13 lists
 * all approved photos, swagotra, maternal gothra, date of birth and time of
 * birth. A2 adds religion to that set, and A1 confirms the full date of birth
 * is shown. Community is explicitly NOT here (A2).
 *
 * `profile_locked` is a literal true so the type system prevents a locked
 * response from ever advertising unlocked state.
 */
export declare const LockedProfileResponseSchema: z.ZodObject<{
    profile_id: z.ZodString;
    photos: z.ZodArray<z.ZodObject<{
        photo_id: z.ZodString;
        url: z.ZodString;
        width_px: z.ZodNullable<z.ZodNumber>;
        height_px: z.ZodNullable<z.ZodNumber>;
        is_primary: z.ZodBoolean;
        photo_type: z.ZodEnum<["SINGLE", "FAMILY"]>;
    }, "strict", z.ZodTypeAny, {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }, {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }>, "many">;
    swagotra: z.ZodNullable<z.ZodString>;
    maternal_gothra: z.ZodNullable<z.ZodString>;
    date_of_birth: z.ZodNullable<z.ZodString>;
    time_of_birth: z.ZodNullable<z.ZodString>;
    religion: z.ZodNullable<z.ZodString>;
    age: z.ZodNullable<z.ZodNumber>;
    profile_locked: z.ZodLiteral<true>;
    unlock_price: z.ZodObject<{
        base_amount: z.ZodString;
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
}, "strict", z.ZodTypeAny, {
    profile_id: string;
    photos: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }[];
    swagotra: string | null;
    maternal_gothra: string | null;
    date_of_birth: string | null;
    time_of_birth: string | null;
    religion: string | null;
    age: number | null;
    profile_locked: true;
    unlock_price: {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    };
}, {
    profile_id: string;
    photos: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }[];
    swagotra: string | null;
    maternal_gothra: string | null;
    date_of_birth: string | null;
    time_of_birth: string | null;
    religion: string | null;
    age: number | null;
    profile_locked: true;
    unlock_price: {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    };
}>;
export type LockedProfileResponse = z.infer<typeof LockedProfileResponseSchema>;
/**
 * Section 13, "HIDDEN BEFORE PAYMENT", as revised by the client on 2026-09-29.
 * Kept as an explicit list of field names so a test can assert the locked
 * response contains none of them, and so a future field added to the schema
 * must be consciously classified.
 *
 * Two revisions, both from A1 and A2:
 *
 *   A1 — the full date of birth is now VISIBLE. This also makes age visible,
 *        which is unavoidable: masking a DOB hides nothing, because the date
 *        itself gives the age away. `age` and `age_derived` are therefore
 *        removed from this list too, and the app must stop pretending to hide
 *        them.
 *   A2 — `community` is HIDDEN and `religion` is VISIBLE on the free preview.
 *        This is the reverse of how the two were previously grouped, and it
 *        was not one of the options offered in the questionnaire. It is
 *        implemented as written and flagged for confirmation.
 */
export declare const HIDDEN_BEFORE_PAYMENT: readonly ["name", "first_name", "last_name", "height_cm", "education", "profession", "company", "annual_income", "location", "country", "state", "city", "community", "mother_tongue", "family", "family_details", "fathers_occupation", "mothers_occupation", "siblings", "family_location", "family_description", "lifestyle", "food_preference", "smoking", "drinking", "about_me", "partner_expectations", "horoscope", "rashi", "nakshatra", "gan", "manglik_status", "contact", "contact_number", "mobile", "email", "metadata", "attributes"];
export type HiddenBeforePayment = (typeof HIDDEN_BEFORE_PAYMENT)[number];
/**
 * A2: shown on the locked preview even though the base document did not
 * classify them. Asserted in tests so a later "tidy-up" cannot quietly hide
 * them again.
 */
export declare const VISIBLE_BEFORE_PAYMENT: readonly ["date_of_birth", "age", "religion", "gender"];
/** Everything that was hidden in section 13, revealed only after authorisation. */
export declare const FullProfileSchema: z.ZodObject<{
    first_name: z.ZodString;
    last_name: z.ZodNullable<z.ZodString>;
    gender: z.ZodString;
    age: z.ZodNullable<z.ZodNumber>;
    date_of_birth: z.ZodNullable<z.ZodString>;
    time_of_birth: z.ZodNullable<z.ZodString>;
    place_of_birth: z.ZodNullable<z.ZodString>;
    height_cm: z.ZodNullable<z.ZodNumber>;
    religion: z.ZodNullable<z.ZodString>;
    sub_caste: z.ZodNullable<z.ZodString>;
    community: z.ZodNullable<z.ZodString>;
    mother_tongue: z.ZodNullable<z.ZodString>;
    swagotra: z.ZodNullable<z.ZodString>;
    maternal_gothra: z.ZodNullable<z.ZodString>;
    rashi: z.ZodNullable<z.ZodString>;
    nakshatra: z.ZodNullable<z.ZodString>;
    gan: z.ZodNullable<z.ZodString>;
    manglik_status: z.ZodNullable<z.ZodString>;
    education: z.ZodNullable<z.ZodString>;
    profession: z.ZodNullable<z.ZodString>;
    company: z.ZodNullable<z.ZodString>;
    annual_income: z.ZodNullable<z.ZodString>;
    work_location: z.ZodNullable<z.ZodString>;
    fathers_occupation: z.ZodNullable<z.ZodString>;
    mothers_occupation: z.ZodNullable<z.ZodString>;
    siblings: z.ZodNullable<z.ZodString>;
    family_location: z.ZodNullable<z.ZodString>;
    family_description: z.ZodNullable<z.ZodString>;
    food_preference: z.ZodNullable<z.ZodString>;
    smoking: z.ZodNullable<z.ZodString>;
    drinking: z.ZodNullable<z.ZodString>;
    about_me: z.ZodNullable<z.ZodString>;
    country: z.ZodNullable<z.ZodString>;
    state: z.ZodNullable<z.ZodString>;
    city: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    swagotra: string | null;
    maternal_gothra: string | null;
    date_of_birth: string | null;
    time_of_birth: string | null;
    religion: string | null;
    age: number | null;
    first_name: string;
    last_name: string | null;
    height_cm: number | null;
    education: string | null;
    profession: string | null;
    company: string | null;
    annual_income: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
    community: string | null;
    mother_tongue: string | null;
    fathers_occupation: string | null;
    mothers_occupation: string | null;
    siblings: string | null;
    family_location: string | null;
    family_description: string | null;
    food_preference: string | null;
    smoking: string | null;
    drinking: string | null;
    about_me: string | null;
    rashi: string | null;
    nakshatra: string | null;
    gan: string | null;
    manglik_status: string | null;
    gender: string;
    place_of_birth: string | null;
    sub_caste: string | null;
    work_location: string | null;
}, {
    swagotra: string | null;
    maternal_gothra: string | null;
    date_of_birth: string | null;
    time_of_birth: string | null;
    religion: string | null;
    age: number | null;
    first_name: string;
    last_name: string | null;
    height_cm: number | null;
    education: string | null;
    profession: string | null;
    company: string | null;
    annual_income: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
    community: string | null;
    mother_tongue: string | null;
    fathers_occupation: string | null;
    mothers_occupation: string | null;
    siblings: string | null;
    family_location: string | null;
    family_description: string | null;
    food_preference: string | null;
    smoking: string | null;
    drinking: string | null;
    about_me: string | null;
    rashi: string | null;
    nakshatra: string | null;
    gan: string | null;
    manglik_status: string | null;
    gender: string;
    place_of_birth: string | null;
    sub_caste: string | null;
    work_location: string | null;
}>;
export type FullProfile = z.infer<typeof FullProfileSchema>;
/**
 * Section 17: "Contact returned only when active unlock exists." Served with
 * Cache-Control: no-store so the app cannot persist it insecurely.
 */
export declare const ContactSchema: z.ZodObject<{
    mobile: z.ZodString;
    /** Section 21: hidden entirely once the owner has been anonymised. */
    is_available: z.ZodBoolean;
    hidden_reason: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    mobile: string;
    is_available: boolean;
    hidden_reason: string | null;
}, {
    mobile: string;
    is_available: boolean;
    hidden_reason: string | null;
}>;
export type Contact = z.infer<typeof ContactSchema>;
export declare const UnlockedProfileResponseSchema: z.ZodObject<{
    profile_id: z.ZodString;
    photos: z.ZodArray<z.ZodObject<{
        photo_id: z.ZodString;
        url: z.ZodString;
        width_px: z.ZodNullable<z.ZodNumber>;
        height_px: z.ZodNullable<z.ZodNumber>;
        is_primary: z.ZodBoolean;
        photo_type: z.ZodEnum<["SINGLE", "FAMILY"]>;
    }, "strict", z.ZodTypeAny, {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }, {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }>, "many">;
    full_profile: z.ZodObject<{
        first_name: z.ZodString;
        last_name: z.ZodNullable<z.ZodString>;
        gender: z.ZodString;
        age: z.ZodNullable<z.ZodNumber>;
        date_of_birth: z.ZodNullable<z.ZodString>;
        time_of_birth: z.ZodNullable<z.ZodString>;
        place_of_birth: z.ZodNullable<z.ZodString>;
        height_cm: z.ZodNullable<z.ZodNumber>;
        religion: z.ZodNullable<z.ZodString>;
        sub_caste: z.ZodNullable<z.ZodString>;
        community: z.ZodNullable<z.ZodString>;
        mother_tongue: z.ZodNullable<z.ZodString>;
        swagotra: z.ZodNullable<z.ZodString>;
        maternal_gothra: z.ZodNullable<z.ZodString>;
        rashi: z.ZodNullable<z.ZodString>;
        nakshatra: z.ZodNullable<z.ZodString>;
        gan: z.ZodNullable<z.ZodString>;
        manglik_status: z.ZodNullable<z.ZodString>;
        education: z.ZodNullable<z.ZodString>;
        profession: z.ZodNullable<z.ZodString>;
        company: z.ZodNullable<z.ZodString>;
        annual_income: z.ZodNullable<z.ZodString>;
        work_location: z.ZodNullable<z.ZodString>;
        fathers_occupation: z.ZodNullable<z.ZodString>;
        mothers_occupation: z.ZodNullable<z.ZodString>;
        siblings: z.ZodNullable<z.ZodString>;
        family_location: z.ZodNullable<z.ZodString>;
        family_description: z.ZodNullable<z.ZodString>;
        food_preference: z.ZodNullable<z.ZodString>;
        smoking: z.ZodNullable<z.ZodString>;
        drinking: z.ZodNullable<z.ZodString>;
        about_me: z.ZodNullable<z.ZodString>;
        country: z.ZodNullable<z.ZodString>;
        state: z.ZodNullable<z.ZodString>;
        city: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        swagotra: string | null;
        maternal_gothra: string | null;
        date_of_birth: string | null;
        time_of_birth: string | null;
        religion: string | null;
        age: number | null;
        first_name: string;
        last_name: string | null;
        height_cm: number | null;
        education: string | null;
        profession: string | null;
        company: string | null;
        annual_income: string | null;
        country: string | null;
        state: string | null;
        city: string | null;
        community: string | null;
        mother_tongue: string | null;
        fathers_occupation: string | null;
        mothers_occupation: string | null;
        siblings: string | null;
        family_location: string | null;
        family_description: string | null;
        food_preference: string | null;
        smoking: string | null;
        drinking: string | null;
        about_me: string | null;
        rashi: string | null;
        nakshatra: string | null;
        gan: string | null;
        manglik_status: string | null;
        gender: string;
        place_of_birth: string | null;
        sub_caste: string | null;
        work_location: string | null;
    }, {
        swagotra: string | null;
        maternal_gothra: string | null;
        date_of_birth: string | null;
        time_of_birth: string | null;
        religion: string | null;
        age: number | null;
        first_name: string;
        last_name: string | null;
        height_cm: number | null;
        education: string | null;
        profession: string | null;
        company: string | null;
        annual_income: string | null;
        country: string | null;
        state: string | null;
        city: string | null;
        community: string | null;
        mother_tongue: string | null;
        fathers_occupation: string | null;
        mothers_occupation: string | null;
        siblings: string | null;
        family_location: string | null;
        family_description: string | null;
        food_preference: string | null;
        smoking: string | null;
        drinking: string | null;
        about_me: string | null;
        rashi: string | null;
        nakshatra: string | null;
        gan: string | null;
        manglik_status: string | null;
        gender: string;
        place_of_birth: string | null;
        sub_caste: string | null;
        work_location: string | null;
    }>;
    contact: z.ZodObject<{
        mobile: z.ZodString;
        /** Section 21: hidden entirely once the owner has been anonymised. */
        is_available: z.ZodBoolean;
        hidden_reason: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        mobile: string;
        is_available: boolean;
        hidden_reason: string | null;
    }, {
        mobile: string;
        is_available: boolean;
        hidden_reason: string | null;
    }>;
    profile_locked: z.ZodLiteral<false>;
    unlock_expires_at: z.ZodString;
}, "strict", z.ZodTypeAny, {
    profile_id: string;
    photos: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }[];
    profile_locked: false;
    contact: {
        mobile: string;
        is_available: boolean;
        hidden_reason: string | null;
    };
    full_profile: {
        swagotra: string | null;
        maternal_gothra: string | null;
        date_of_birth: string | null;
        time_of_birth: string | null;
        religion: string | null;
        age: number | null;
        first_name: string;
        last_name: string | null;
        height_cm: number | null;
        education: string | null;
        profession: string | null;
        company: string | null;
        annual_income: string | null;
        country: string | null;
        state: string | null;
        city: string | null;
        community: string | null;
        mother_tongue: string | null;
        fathers_occupation: string | null;
        mothers_occupation: string | null;
        siblings: string | null;
        family_location: string | null;
        family_description: string | null;
        food_preference: string | null;
        smoking: string | null;
        drinking: string | null;
        about_me: string | null;
        rashi: string | null;
        nakshatra: string | null;
        gan: string | null;
        manglik_status: string | null;
        gender: string;
        place_of_birth: string | null;
        sub_caste: string | null;
        work_location: string | null;
    };
    unlock_expires_at: string;
}, {
    profile_id: string;
    photos: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }[];
    profile_locked: false;
    contact: {
        mobile: string;
        is_available: boolean;
        hidden_reason: string | null;
    };
    full_profile: {
        swagotra: string | null;
        maternal_gothra: string | null;
        date_of_birth: string | null;
        time_of_birth: string | null;
        religion: string | null;
        age: number | null;
        first_name: string;
        last_name: string | null;
        height_cm: number | null;
        education: string | null;
        profession: string | null;
        company: string | null;
        annual_income: string | null;
        country: string | null;
        state: string | null;
        city: string | null;
        community: string | null;
        mother_tongue: string | null;
        fathers_occupation: string | null;
        mothers_occupation: string | null;
        siblings: string | null;
        family_location: string | null;
        family_description: string | null;
        food_preference: string | null;
        smoking: string | null;
        drinking: string | null;
        about_me: string | null;
        rashi: string | null;
        nakshatra: string | null;
        gan: string | null;
        manglik_status: string | null;
        gender: string;
        place_of_birth: string | null;
        sub_caste: string | null;
        work_location: string | null;
    };
    unlock_expires_at: string;
}>;
export type UnlockedProfileResponse = z.infer<typeof UnlockedProfileResponseSchema>;
export declare const ExpiredUnlockResponseSchema: z.ZodObject<{
    profile_id: z.ZodString;
    photos: z.ZodArray<z.ZodObject<{
        photo_id: z.ZodString;
        url: z.ZodString;
        width_px: z.ZodNullable<z.ZodNumber>;
        height_px: z.ZodNullable<z.ZodNumber>;
        is_primary: z.ZodBoolean;
        photo_type: z.ZodEnum<["SINGLE", "FAMILY"]>;
    }, "strict", z.ZodTypeAny, {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }, {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }>, "many">;
    swagotra: z.ZodNullable<z.ZodString>;
    maternal_gothra: z.ZodNullable<z.ZodString>;
    date_of_birth: z.ZodNullable<z.ZodString>;
    time_of_birth: z.ZodNullable<z.ZodString>;
    religion: z.ZodNullable<z.ZodString>;
    age: z.ZodNullable<z.ZodNumber>;
    profile_locked: z.ZodLiteral<true>;
} & {
    unlock_price: z.ZodObject<{
        base_amount: z.ZodString;
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
    previously_unlocked: z.ZodLiteral<true>;
}, "strict", z.ZodTypeAny, {
    profile_id: string;
    photos: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }[];
    swagotra: string | null;
    maternal_gothra: string | null;
    date_of_birth: string | null;
    time_of_birth: string | null;
    religion: string | null;
    age: number | null;
    profile_locked: true;
    unlock_price: {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    };
    previously_unlocked: true;
}, {
    profile_id: string;
    photos: {
        photo_id: string;
        url: string;
        width_px: number | null;
        height_px: number | null;
        is_primary: boolean;
        photo_type: "SINGLE" | "FAMILY";
    }[];
    swagotra: string | null;
    maternal_gothra: string | null;
    date_of_birth: string | null;
    time_of_birth: string | null;
    religion: string | null;
    age: number | null;
    profile_locked: true;
    unlock_price: {
        base_amount: string;
        gst_rate: string;
        gst_amount: string;
        total_amount: string;
        currency: "INR";
    };
    previously_unlocked: true;
}>;
export type ExpiredUnlockResponse = z.infer<typeof ExpiredUnlockResponseSchema>;
//# sourceMappingURL=profile.d.ts.map