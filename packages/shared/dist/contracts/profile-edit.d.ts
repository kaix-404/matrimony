/**
 * Profile-editing contracts — spec sections 8, 9, 10.
 *
 * WHAT IS DELIBERATELY MISSING
 * ----------------------------
 * No net-worth category. `User.networthCategory` is server-controlled and
 * immutable after registration (section 36, client answer B1); only an audited
 * admin action can move it. There is no field to send it in, so a client that
 * tries cannot — the omission is the enforcement.
 *
 * No photo bytes. Photos go straight to object storage via a presigned URL; the
 * API never proxies an image, so there is no multipart contract here to get
 * wrong.
 *
 * SECTION 8 IS NOT OPTIONAL FIELDS
 * --------------------------------
 * Only `first_name`, `gender` and `date_of_birth` are required (they are
 * non-nullable in the schema). Everything else is nullable because the client
 * asked for progressive onboarding — a user should be able to save a partial
 * profile and come back to it. That is why PATCH semantics are used: an absent
 * field means "leave it alone", never "clear it", so a partial save from a
 * partially-filled form cannot silently wipe fields the user did not touch.
 * Clearing a field is an explicit `null`.
 */
import { z } from 'zod';
/**
 * Creates the user's own profile.
 *
 * `*_id` fields are master-list *value ids*, not free text, so reference data
 * and stored profiles cannot drift apart. The server resolves each id against
 * its own list, which is also why a value an admin has retired stops being
 * accepted.
 */
export declare const CreateProfileSchema: z.ZodObject<{
    first_name: z.ZodEffects<z.ZodString, string, string>;
    last_name: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    gender: z.ZodEnum<["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]>;
    date_of_birth: z.ZodEffects<z.ZodString, string, string>;
    time_of_birth: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    place_of_birth: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    height_cm: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    marital_status: z.ZodOptional<z.ZodNullable<z.ZodEnum<["NEVER_MARRIED", "DIVORCED", "WIDOWED", "AWAITING_DIVORCE", "ANNULLED"]>>>;
    religion: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    community_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    mother_tongue: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    swagotra: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    maternal_gothra: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    rashi: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    nakshatra: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    gan: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    manglik_status: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    education_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    profession_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    company: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    annual_income: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    work_location: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    fathers_occupation: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    mothers_occupation: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    siblings: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    family_location: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    family_description: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    food_preference: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    smoking: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    drinking: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    about_me: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    country: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>>;
    state: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    city: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
}, "strict", z.ZodTypeAny, {
    first_name: string;
    gender: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";
    date_of_birth: string;
    last_name?: string | null | undefined;
    time_of_birth?: string | null | undefined;
    place_of_birth?: string | null | undefined;
    height_cm?: number | null | undefined;
    marital_status?: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null | undefined;
    religion?: string | null | undefined;
    community_id?: string | null | undefined;
    mother_tongue?: string | null | undefined;
    swagotra?: string | null | undefined;
    maternal_gothra?: string | null | undefined;
    rashi?: string | null | undefined;
    nakshatra?: string | null | undefined;
    gan?: string | null | undefined;
    manglik_status?: string | null | undefined;
    education_id?: string | null | undefined;
    profession_id?: string | null | undefined;
    company?: string | null | undefined;
    annual_income?: string | null | undefined;
    work_location?: string | null | undefined;
    fathers_occupation?: string | null | undefined;
    mothers_occupation?: string | null | undefined;
    siblings?: string | null | undefined;
    family_location?: string | null | undefined;
    family_description?: string | null | undefined;
    food_preference?: string | null | undefined;
    smoking?: string | null | undefined;
    drinking?: string | null | undefined;
    about_me?: string | null | undefined;
    country?: string | null | undefined;
    state?: string | null | undefined;
    city?: string | null | undefined;
}, {
    first_name: string;
    gender: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";
    date_of_birth: string;
    last_name?: string | null | undefined;
    time_of_birth?: string | null | undefined;
    place_of_birth?: string | null | undefined;
    height_cm?: number | null | undefined;
    marital_status?: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null | undefined;
    religion?: string | null | undefined;
    community_id?: string | null | undefined;
    mother_tongue?: string | null | undefined;
    swagotra?: string | null | undefined;
    maternal_gothra?: string | null | undefined;
    rashi?: string | null | undefined;
    nakshatra?: string | null | undefined;
    gan?: string | null | undefined;
    manglik_status?: string | null | undefined;
    education_id?: string | null | undefined;
    profession_id?: string | null | undefined;
    company?: string | null | undefined;
    annual_income?: string | null | undefined;
    work_location?: string | null | undefined;
    fathers_occupation?: string | null | undefined;
    mothers_occupation?: string | null | undefined;
    siblings?: string | null | undefined;
    family_location?: string | null | undefined;
    family_description?: string | null | undefined;
    food_preference?: string | null | undefined;
    smoking?: string | null | undefined;
    drinking?: string | null | undefined;
    about_me?: string | null | undefined;
    country?: string | null | undefined;
    state?: string | null | undefined;
    city?: string | null | undefined;
}>;
export type CreateProfileInput = z.infer<typeof CreateProfileSchema>;
/**
 * A partial profile update.
 *
 * Spelled out rather than derived from `CreateProfile` because the absent /
 * null distinction has to survive into the type: `absent` means leave alone,
 * `null` means clear. Deriving it with Partial would also drop the create-time
 * guarantee that `first_name` is non-empty, which must still hold on update.
 */
export declare const UpdateProfileSchema: z.ZodEffects<z.ZodObject<{
    first_name: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    last_name: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    gender: z.ZodOptional<z.ZodEnum<["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]>>;
    date_of_birth: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    time_of_birth: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    place_of_birth: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    height_cm: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    marital_status: z.ZodOptional<z.ZodNullable<z.ZodEnum<["NEVER_MARRIED", "DIVORCED", "WIDOWED", "AWAITING_DIVORCE", "ANNULLED"]>>>;
    religion: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    community_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    mother_tongue: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    swagotra: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    maternal_gothra: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    rashi: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    nakshatra: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    gan: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    manglik_status: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    education_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    profession_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    company: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    annual_income: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    work_location: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    fathers_occupation: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    mothers_occupation: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    siblings: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    family_location: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    family_description: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    food_preference: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    smoking: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    drinking: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    about_me: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    country: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>>;
    state: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    city: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
}, "strict", z.ZodTypeAny, {
    first_name?: string | undefined;
    last_name?: string | null | undefined;
    gender?: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY" | undefined;
    date_of_birth?: string | undefined;
    time_of_birth?: string | null | undefined;
    place_of_birth?: string | null | undefined;
    height_cm?: number | null | undefined;
    marital_status?: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null | undefined;
    religion?: string | null | undefined;
    community_id?: string | null | undefined;
    mother_tongue?: string | null | undefined;
    swagotra?: string | null | undefined;
    maternal_gothra?: string | null | undefined;
    rashi?: string | null | undefined;
    nakshatra?: string | null | undefined;
    gan?: string | null | undefined;
    manglik_status?: string | null | undefined;
    education_id?: string | null | undefined;
    profession_id?: string | null | undefined;
    company?: string | null | undefined;
    annual_income?: string | null | undefined;
    work_location?: string | null | undefined;
    fathers_occupation?: string | null | undefined;
    mothers_occupation?: string | null | undefined;
    siblings?: string | null | undefined;
    family_location?: string | null | undefined;
    family_description?: string | null | undefined;
    food_preference?: string | null | undefined;
    smoking?: string | null | undefined;
    drinking?: string | null | undefined;
    about_me?: string | null | undefined;
    country?: string | null | undefined;
    state?: string | null | undefined;
    city?: string | null | undefined;
}, {
    first_name?: string | undefined;
    last_name?: string | null | undefined;
    gender?: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY" | undefined;
    date_of_birth?: string | undefined;
    time_of_birth?: string | null | undefined;
    place_of_birth?: string | null | undefined;
    height_cm?: number | null | undefined;
    marital_status?: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null | undefined;
    religion?: string | null | undefined;
    community_id?: string | null | undefined;
    mother_tongue?: string | null | undefined;
    swagotra?: string | null | undefined;
    maternal_gothra?: string | null | undefined;
    rashi?: string | null | undefined;
    nakshatra?: string | null | undefined;
    gan?: string | null | undefined;
    manglik_status?: string | null | undefined;
    education_id?: string | null | undefined;
    profession_id?: string | null | undefined;
    company?: string | null | undefined;
    annual_income?: string | null | undefined;
    work_location?: string | null | undefined;
    fathers_occupation?: string | null | undefined;
    mothers_occupation?: string | null | undefined;
    siblings?: string | null | undefined;
    family_location?: string | null | undefined;
    family_description?: string | null | undefined;
    food_preference?: string | null | undefined;
    smoking?: string | null | undefined;
    drinking?: string | null | undefined;
    about_me?: string | null | undefined;
    country?: string | null | undefined;
    state?: string | null | undefined;
    city?: string | null | undefined;
}>, {
    first_name?: string | undefined;
    last_name?: string | null | undefined;
    gender?: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY" | undefined;
    date_of_birth?: string | undefined;
    time_of_birth?: string | null | undefined;
    place_of_birth?: string | null | undefined;
    height_cm?: number | null | undefined;
    marital_status?: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null | undefined;
    religion?: string | null | undefined;
    community_id?: string | null | undefined;
    mother_tongue?: string | null | undefined;
    swagotra?: string | null | undefined;
    maternal_gothra?: string | null | undefined;
    rashi?: string | null | undefined;
    nakshatra?: string | null | undefined;
    gan?: string | null | undefined;
    manglik_status?: string | null | undefined;
    education_id?: string | null | undefined;
    profession_id?: string | null | undefined;
    company?: string | null | undefined;
    annual_income?: string | null | undefined;
    work_location?: string | null | undefined;
    fathers_occupation?: string | null | undefined;
    mothers_occupation?: string | null | undefined;
    siblings?: string | null | undefined;
    family_location?: string | null | undefined;
    family_description?: string | null | undefined;
    food_preference?: string | null | undefined;
    smoking?: string | null | undefined;
    drinking?: string | null | undefined;
    about_me?: string | null | undefined;
    country?: string | null | undefined;
    state?: string | null | undefined;
    city?: string | null | undefined;
}, {
    first_name?: string | undefined;
    last_name?: string | null | undefined;
    gender?: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY" | undefined;
    date_of_birth?: string | undefined;
    time_of_birth?: string | null | undefined;
    place_of_birth?: string | null | undefined;
    height_cm?: number | null | undefined;
    marital_status?: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null | undefined;
    religion?: string | null | undefined;
    community_id?: string | null | undefined;
    mother_tongue?: string | null | undefined;
    swagotra?: string | null | undefined;
    maternal_gothra?: string | null | undefined;
    rashi?: string | null | undefined;
    nakshatra?: string | null | undefined;
    gan?: string | null | undefined;
    manglik_status?: string | null | undefined;
    education_id?: string | null | undefined;
    profession_id?: string | null | undefined;
    company?: string | null | undefined;
    annual_income?: string | null | undefined;
    work_location?: string | null | undefined;
    fathers_occupation?: string | null | undefined;
    mothers_occupation?: string | null | undefined;
    siblings?: string | null | undefined;
    family_location?: string | null | undefined;
    family_description?: string | null | undefined;
    food_preference?: string | null | undefined;
    smoking?: string | null | undefined;
    drinking?: string | null | undefined;
    about_me?: string | null | undefined;
    country?: string | null | undefined;
    state?: string | null | undefined;
    city?: string | null | undefined;
}>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
/**
 * A photo as its owner sees it.
 *
 * Includes `object_key` and the review state, which the owner's own view may
 * show but another user's must never contain. `preview_url` is a presigned URL
 * with a bounded lifetime, minted per request rather than stored — a stored URL
 * expires, and worse invites treating it as a permanent link.
 */
export declare const OwnPhotoSchema: z.ZodObject<{
    photo_id: z.ZodString;
    object_key: z.ZodString;
    mime_type: z.ZodString;
    byte_size: z.ZodNumber;
    width_px: z.ZodNumber;
    height_px: z.ZodNumber;
    photo_type: z.ZodEnum<["SINGLE", "FAMILY"]>;
    is_primary: z.ZodBoolean;
    sort_order: z.ZodNumber;
    status: z.ZodEnum<["PENDING_REVIEW", "APPROVED", "REJECTED"]>;
    rejection_reason: z.ZodNullable<z.ZodString>;
    preview_url: z.ZodNullable<z.ZodString>;
    created_at: z.ZodString;
}, "strict", z.ZodTypeAny, {
    status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
    photo_id: string;
    object_key: string;
    mime_type: string;
    byte_size: number;
    width_px: number;
    height_px: number;
    photo_type: "SINGLE" | "FAMILY";
    is_primary: boolean;
    sort_order: number;
    rejection_reason: string | null;
    preview_url: string | null;
    created_at: string;
}, {
    status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
    photo_id: string;
    object_key: string;
    mime_type: string;
    byte_size: number;
    width_px: number;
    height_px: number;
    photo_type: "SINGLE" | "FAMILY";
    is_primary: boolean;
    sort_order: number;
    rejection_reason: string | null;
    preview_url: string | null;
    created_at: string;
}>;
export type OwnPhoto = z.infer<typeof OwnPhotoSchema>;
/**
 * The owner's own profile.
 *
 * Not the locked preview and not the unlocked-other-user response — the full
 * record, because an owner is always authorised to see their own data. A
 * deliberately separate schema from `FullProfile` so that adding a field here
 * cannot quietly widen what another user receives.
 */
export declare const MyProfileSchema: z.ZodObject<{
    profile_id: z.ZodString;
    /** Echoed back read-only: the client displays the band, never sends it. */
    networth_category: z.ZodString;
    first_name: z.ZodString;
    last_name: z.ZodNullable<z.ZodString>;
    gender: z.ZodEnum<["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]>;
    date_of_birth: z.ZodString;
    time_of_birth: z.ZodNullable<z.ZodString>;
    place_of_birth: z.ZodNullable<z.ZodString>;
    height_cm: z.ZodNullable<z.ZodNumber>;
    marital_status: z.ZodNullable<z.ZodEnum<["NEVER_MARRIED", "DIVORCED", "WIDOWED", "AWAITING_DIVORCE", "ANNULLED"]>>;
    religion: z.ZodNullable<z.ZodString>;
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
    status: z.ZodEnum<["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "SUSPENDED", "DELETED"]>;
    /**
     * Why a moderator refused the profile, and only ever set while it is
     * REJECTED. Section 26 makes delivering the reason part of the refusal: a
     * profile that silently goes back to the member with no explanation is one
     * they can only resubmit unchanged.
     */
    rejection_reason: z.ZodNullable<z.ZodString>;
    visibility: z.ZodEnum<["ACTIVE", "PAUSED", "HIDDEN"]>;
    photos: z.ZodArray<z.ZodObject<{
        photo_id: z.ZodString;
        object_key: z.ZodString;
        mime_type: z.ZodString;
        byte_size: z.ZodNumber;
        width_px: z.ZodNumber;
        height_px: z.ZodNumber;
        photo_type: z.ZodEnum<["SINGLE", "FAMILY"]>;
        is_primary: z.ZodBoolean;
        sort_order: z.ZodNumber;
        status: z.ZodEnum<["PENDING_REVIEW", "APPROVED", "REJECTED"]>;
        rejection_reason: z.ZodNullable<z.ZodString>;
        preview_url: z.ZodNullable<z.ZodString>;
        created_at: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
        photo_id: string;
        object_key: string;
        mime_type: string;
        byte_size: number;
        width_px: number;
        height_px: number;
        photo_type: "SINGLE" | "FAMILY";
        is_primary: boolean;
        sort_order: number;
        rejection_reason: string | null;
        preview_url: string | null;
        created_at: string;
    }, {
        status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
        photo_id: string;
        object_key: string;
        mime_type: string;
        byte_size: number;
        width_px: number;
        height_px: number;
        photo_type: "SINGLE" | "FAMILY";
        is_primary: boolean;
        sort_order: number;
        rejection_reason: string | null;
        preview_url: string | null;
        created_at: string;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    first_name: string;
    last_name: string | null;
    gender: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";
    status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "DRAFT" | "SUSPENDED" | "DELETED";
    date_of_birth: string;
    time_of_birth: string | null;
    place_of_birth: string | null;
    height_cm: number | null;
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    mother_tongue: string | null;
    swagotra: string | null;
    maternal_gothra: string | null;
    rashi: string | null;
    nakshatra: string | null;
    gan: string | null;
    manglik_status: string | null;
    company: string | null;
    annual_income: string | null;
    work_location: string | null;
    fathers_occupation: string | null;
    mothers_occupation: string | null;
    siblings: string | null;
    family_location: string | null;
    family_description: string | null;
    food_preference: string | null;
    smoking: string | null;
    drinking: string | null;
    about_me: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
    rejection_reason: string | null;
    profile_id: string;
    networth_category: string;
    community: string | null;
    education: string | null;
    profession: string | null;
    visibility: "ACTIVE" | "PAUSED" | "HIDDEN";
    photos: {
        status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
        photo_id: string;
        object_key: string;
        mime_type: string;
        byte_size: number;
        width_px: number;
        height_px: number;
        photo_type: "SINGLE" | "FAMILY";
        is_primary: boolean;
        sort_order: number;
        rejection_reason: string | null;
        preview_url: string | null;
        created_at: string;
    }[];
}, {
    first_name: string;
    last_name: string | null;
    gender: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";
    status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "DRAFT" | "SUSPENDED" | "DELETED";
    date_of_birth: string;
    time_of_birth: string | null;
    place_of_birth: string | null;
    height_cm: number | null;
    marital_status: "NEVER_MARRIED" | "DIVORCED" | "WIDOWED" | "AWAITING_DIVORCE" | "ANNULLED" | null;
    religion: string | null;
    mother_tongue: string | null;
    swagotra: string | null;
    maternal_gothra: string | null;
    rashi: string | null;
    nakshatra: string | null;
    gan: string | null;
    manglik_status: string | null;
    company: string | null;
    annual_income: string | null;
    work_location: string | null;
    fathers_occupation: string | null;
    mothers_occupation: string | null;
    siblings: string | null;
    family_location: string | null;
    family_description: string | null;
    food_preference: string | null;
    smoking: string | null;
    drinking: string | null;
    about_me: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
    rejection_reason: string | null;
    profile_id: string;
    networth_category: string;
    community: string | null;
    education: string | null;
    profession: string | null;
    visibility: "ACTIVE" | "PAUSED" | "HIDDEN";
    photos: {
        status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
        photo_id: string;
        object_key: string;
        mime_type: string;
        byte_size: number;
        width_px: number;
        height_px: number;
        photo_type: "SINGLE" | "FAMILY";
        is_primary: boolean;
        sort_order: number;
        rejection_reason: string | null;
        preview_url: string | null;
        created_at: string;
    }[];
}>;
export type MyProfile = z.infer<typeof MyProfileSchema>;
/**
 * Section 8 completion gate.
 *
 * Reported separately rather than derived from the schema, because whether a
 * profile is "complete" is a product decision (is `about_me` mandatory?) and
 * the client may still change it. Keeping it as a server-computed list of
 * outstanding fields means the client renders a checklist without hardcoding the
 * same rule a second time, where the two could disagree.
 */
export declare const ProfileCompletenessSchema: z.ZodObject<{
    is_complete: z.ZodBoolean;
    /** Field names still missing. Empty when `is_complete`. */
    missing_fields: z.ZodArray<z.ZodString, "many">;
}, "strict", z.ZodTypeAny, {
    is_complete: boolean;
    missing_fields: string[];
}, {
    is_complete: boolean;
    missing_fields: string[];
}>;
export type ProfileCompleteness = z.infer<typeof ProfileCompletenessSchema>;
//# sourceMappingURL=profile-edit.d.ts.map