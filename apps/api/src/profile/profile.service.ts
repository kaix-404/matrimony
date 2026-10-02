import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BadMasterListValueError, MasterDataService } from '../master-data/master-data.service';
import { StorageService } from '../storage/s3.service';
import {
  Gender,
  MaritalStatus,
  PrismaClient,
  ProfileStatus,
  ProfileVisibility,
} from '../prisma/prisma-client';
import type {
  CreateProfileInput,
  MyProfile,
  ProfileCompleteness,
  UpdateProfileInput,
} from '@matrimony/shared';

/**
 * Profile creation and editing — spec sections 8, 9 and 12.
 *
 * WHAT THIS SERVICE REFUSES TO DO
 * ------------------------------
 * It never writes `User.networthCategory`. The contract has no field for it and
 * neither does the code below, so the B1 rule cannot be broken from the profile
 * screen even by a client that wanted to. The category is set once at
 * registration and is moved only by an audited admin action (section 25).
 *
 * WHY PATCH AND NOT PUT
 * --------------------
 * Section 8 is progressive: a user saves what they have and returns later. A PUT
 * would require the client to send every field on every save, so a form that has
 * not yet reached the income step would clear the income the user entered last
 * visit. Every write here is therefore a partial update built from the keys the
 * caller actually sent — `undefined` never appears in the Prisma data, so
 * absent means "untouched" and an explicit `null` means "clear".
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly masterData: MasterDataService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Creates the caller's profile.
   *
   * Rejects an existing profile with 409 rather than updating it, so a client
   * bug that calls create twice surfaces as an error rather than silently
   * overwriting data with whatever the second call happened to carry.
   */
  async create(userId: string, input: CreateProfileInput): Promise<MyProfile> {
    await this.assertEditable(userId);

    const existing = await this.prisma.profile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Profile already exists');
    }

    const resolved = await this.resolveMasterLists(input);

    await this.prisma.profile.create({
      data: {
        userId,
        firstName: input.first_name,
        lastName: input.last_name ?? null,
        gender: input.gender as Gender,
        // The column is a DATE. Built as UTC so the stored value is the
        // calendar date the user typed: reading it back in a negative-offset
        // zone would otherwise shift a day earlier and display the wrong age.
        dateOfBirth: new Date(`${input.date_of_birth}T00:00:00.000Z`),
        timeOfBirth: input.time_of_birth ?? null,
        placeOfBirth: input.place_of_birth ?? null,
        heightCm: input.height_cm ?? null,
        maritalStatus: (input.marital_status ?? null) as MaritalStatus | null,

        religion: input.religion ?? null,
        communityId: resolved.communityId ?? null,
        motherTongue: input.mother_tongue ?? null,
        swagotra: input.swagotra ?? null,
        maternalGothra: input.maternal_gothra ?? null,
        rashi: input.rashi ?? null,
        nakshatra: input.nakshatra ?? null,
        gan: input.gan ?? null,
        manglikStatus: input.manglik_status ?? null,

        educationId: resolved.educationId ?? null,
        professionId: resolved.professionId ?? null,
        company: input.company ?? null,
        annualIncome: input.annual_income ?? null,
        workLocation: input.work_location ?? null,

        fathersOccupation: input.fathers_occupation ?? null,
        mothersOccupation: input.mothers_occupation ?? null,
        siblings: input.siblings ?? null,
        familyLocation: input.family_location ?? null,
        familyDescription: input.family_description ?? null,

        foodPreference: input.food_preference ?? null,
        smoking: input.smoking ?? null,
        drinking: input.drinking ?? null,
        aboutMe: input.about_me ?? null,

        country: input.country ?? null,
        state: input.state ?? null,
        city: input.city ?? null,

        // DRAFT until the user submits for review. Section 26 makes only
        // APPROVED profiles discoverable, so a half-finished form is never
        // visible to anyone.
        status: ProfileStatus.DRAFT,
        visibility: ProfileVisibility.ACTIVE,
      },
    });

    return this.myProfile(userId);
  }

  /**
   * Applies a partial update.
   *
   * `data` is assembled from the keys the caller sent, so an absent key is never
   * written as `null`. That is the whole point of the endpoint: without it a
   * partial save would erase everything the user did not resend.
   */
  async update(userId: string, input: UpdateProfileInput): Promise<MyProfile> {
    await this.requireProfile(userId);
    await this.assertEditable(userId);

    const resolved = await this.resolveMasterLists(input);
    const data: Record<string, unknown> = {};

    const set = <K extends string>(column: K, value: unknown): void => {
      if (value !== undefined) data[column] = value;
    };

    set('firstName', input.first_name);
    set('lastName', input.last_name);
    if (input.gender !== undefined) data['gender'] = input.gender as Gender;
    if (input.date_of_birth !== undefined) {
      data['dateOfBirth'] = new Date(`${input.date_of_birth}T00:00:00.000Z`);
    }
    set('timeOfBirth', input.time_of_birth);
    set('placeOfBirth', input.place_of_birth);
    set('heightCm', input.height_cm);
    if (input.marital_status !== undefined) {
      data['maritalStatus'] = input.marital_status as MaritalStatus | null;
    }

    set('religion', input.religion);
    set('communityId', resolved.communityId);
    set('motherTongue', input.mother_tongue);
    set('swagotra', input.swagotra);
    set('maternalGothra', input.maternal_gothra);
    set('rashi', input.rashi);
    set('nakshatra', input.nakshatra);
    set('gan', input.gan);
    set('manglikStatus', input.manglik_status);

    set('educationId', resolved.educationId);
    set('professionId', resolved.professionId);
    set('company', input.company);
    set('annualIncome', input.annual_income);
    set('workLocation', input.work_location);

    set('fathersOccupation', input.fathers_occupation);
    set('mothersOccupation', input.mothers_occupation);
    set('siblings', input.siblings);
    set('familyLocation', input.family_location);
    set('familyDescription', input.family_description);

    set('foodPreference', input.food_preference);
    set('smoking', input.smoking);
    set('drinking', input.drinking);
    set('aboutMe', input.about_me);

    set('country', input.country);
    set('state', input.state);
    set('city', input.city);

    // Resolving a master-list id to null clears the column, but a client that
    // sent no such key must leave it alone. `set` above distinguishes the two
    // because resolution returns undefined for an absent key.
    if (Object.keys(data).length === 0) {
      // The schema rejects an empty patch, so reaching this means the payload
      // held only master-list keys that resolved to nothing — a client bug worth
      // surfacing rather than a silent no-op.
      throw new BadRequestException('Nothing to update');
    }

    // Editing a profile that is already under review or approved invalidates the
    // review, so it goes back to DRAFT. A moderator who approved a photo set has
    // not necessarily approved a later edit, and section 26 makes approval
    // about the profile as it stands.
    data['status'] = ProfileStatus.DRAFT;
    data['rejectedAt'] = null;
    data['rejectionReason'] = null;

    await this.prisma.profile.update({ where: { userId }, data });

    return this.myProfile(userId);
  }

  /** The caller's own profile, with their photos. */
  async myProfile(userId: string): Promise<MyProfile> {
    const row = await this.load(userId);
    return this.toContract(row, await this.ownPhotos(row.id));
  }

  /**
   * Reports what section 8 still needs.
   *
   * Computed here rather than in the app because the definition of "complete"
   * is a product decision that will be revisited; the client asked for a
   * checklist. Deriving it in two places is how an app ends up inviting a user
   * to fill a field that is already stored.
   */
  async completeness(userId: string): Promise<ProfileCompleteness> {
    const row = await this.requireProfile(userId);
    const missing: string[] = [];

    // Only the columns the product cannot function without. Deliberately not
    // `about_me` or family fields: the client has not said those are mandatory,
    // and marking a profile incomplete for a missing bio would block discovery
    // for a user the business considers ready.
    if (!row.firstName) missing.push('first_name');
    if (!row.gender) missing.push('gender');
    if (!row.dateOfBirth) missing.push('date_of_birth');

    return { is_complete: missing.length === 0, missing_fields: missing };
  }

  /** Pauses or resumes the caller's own visibility (section 12). */
  async setVisibility(userId: string, visibility: ProfileVisibility): Promise<MyProfile> {
    await this.requireProfile(userId);
    await this.assertEditable(userId);
    await this.prisma.profile.update({ where: { userId }, data: { visibility } });
    return this.myProfile(userId);
  }

  /**
   * Whether the user's status permits editing.
   *
   * Kept separate from `requireProfile` because a suspended user should still be
   * able to *read* their profile, and a read endpoint that shares this check
   * would hide data the user is entitled to see.
   */
  private async assertEditable(userId: string): Promise<void> {
    const user = await this.userStatus(userId);
    const status = user.deletedAt ? 'DELETED' : user.status;
    if (status === 'DELETED' || status === 'SUSPENDED') {
      throw new ConflictException(`Account is ${status.toLowerCase()}; profile cannot be edited`);
    }
  }

  private async resolveMasterLists(input: {
    education_id?: string | null;
    profession_id?: string | null;
    community_id?: string | null;
  }): Promise<{
    educationId?: string;
    educationValue?: string;
    professionId?: string;
    professionValue?: string;
    communityId?: string;
    communityValue?: string;
  }> {
    try {
      return await this.masterData.resolveForProfile(input);
    } catch (error) {
      if (error instanceof BadMasterListValueError) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: [{ field: error.field, messages: ['unknown or inactive value'] }],
        });
      }
      throw error;
    }
  }

  private async requireProfile(userId: string) {
    const row = await this.prisma.profile.findUnique({ where: { userId } });
    if (!row) {
      throw new NotFoundException('Profile not found');
    }
    return row;
  }

  /** The caller's user status, for callers that need the raw record. */
  private async userStatus(userId: string): Promise<{ status: string; deletedAt: Date | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, deletedAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * The caller's photos, newest order by sort.
   *
   * Public because the photo endpoints need it too: after a delete or a
   * "set primary" the app is handed the same list the profile view renders, so
   * one projection serves both and the two cannot disagree.
   */
  async ownPhotos(profileId: string): Promise<MyProfile['photos']> {
    const photos = await this.prisma.profilePhoto.findMany({
      where: { profileId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        objectKey: true,
        mimeType: true,
        byteSize: true,
        widthPx: true,
        heightPx: true,
        photoType: true,
        isPrimary: true,
        sortOrder: true,
        status: true,
        rejectionReason: true,
        createdAt: true,
      },
    });

    return Promise.all(
      photos.map(async (photo) => ({
        photo_id: photo.id,
        object_key: photo.objectKey,
        mime_type: photo.mimeType,
        byte_size: photo.byteSize,
        width_px: photo.widthPx,
        height_px: photo.heightPx,
        photo_type: photo.photoType,
        is_primary: photo.isPrimary,
        sort_order: photo.sortOrder,
        status: photo.status,
        rejection_reason: photo.rejectionReason,
        // Minted per request. A signed URL embedded in the payload would be
        // cached by the app and outlive its own expiry.
        preview_url: await this.storage.presignDownload(photo.objectKey).catch(() => null),
        created_at: photo.createdAt.toISOString(),
      })),
    );
  }

  private async load(userId: string) {
    const row = await this.prisma.profile.findUnique({
      where: { userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        gender: true,
        dateOfBirth: true,
        timeOfBirth: true,
        placeOfBirth: true,
        heightCm: true,
        maritalStatus: true,
        religion: true,
        communityValue: { select: { value: true } },
        motherTongue: true,
        swagotra: true,
        maternalGothra: true,
        rashi: true,
        nakshatra: true,
        gan: true,
        manglikStatus: true,
        educationValue: { select: { value: true } },
        professionValue: { select: { value: true } },
        company: true,
        annualIncome: true,
        workLocation: true,
        fathersOccupation: true,
        mothersOccupation: true,
        siblings: true,
        familyLocation: true,
        familyDescription: true,
        foodPreference: true,
        smoking: true,
        drinking: true,
        aboutMe: true,
        country: true,
        state: true,
        city: true,
        status: true,
        visibility: true,
        user: { select: { networthCategory: true } },
      },
    });

    if (!row) {
      throw new NotFoundException('Profile not found');
    }
    return row;
  }

  private toContract(
    row: Awaited<ReturnType<ProfileService['load']>>,
    photos: MyProfile['photos'],
  ): MyProfile {
    return {
      profile_id: row.id,
      networth_category: row.user.networthCategory,
      first_name: row.firstName,
      last_name: row.lastName,
      gender: row.gender,
      // Rendered as the calendar date, not a shifted local date.
      date_of_birth: row.dateOfBirth.toISOString().slice(0, 10),
      time_of_birth: row.timeOfBirth,
      place_of_birth: row.placeOfBirth,
      height_cm: row.heightCm,
      marital_status: row.maritalStatus,
      religion: row.religion,
      community: row.communityValue?.value ?? null,
      mother_tongue: row.motherTongue,
      swagotra: row.swagotra,
      maternal_gothra: row.maternalGothra,
      rashi: row.rashi,
      nakshatra: row.nakshatra,
      gan: row.gan,
      manglik_status: row.manglikStatus,
      education: row.educationValue?.value ?? null,
      profession: row.professionValue?.value ?? null,
      company: row.company,
      annual_income: row.annualIncome,
      work_location: row.workLocation,
      fathers_occupation: row.fathersOccupation,
      mothers_occupation: row.mothersOccupation,
      siblings: row.siblings,
      family_location: row.familyLocation,
      family_description: row.familyDescription,
      food_preference: row.foodPreference,
      smoking: row.smoking,
      drinking: row.drinking,
      about_me: row.aboutMe,
      country: row.country,
      state: row.state,
      city: row.city,
      status: row.status,
      visibility: row.visibility,
      photos,
    };
  }
}
