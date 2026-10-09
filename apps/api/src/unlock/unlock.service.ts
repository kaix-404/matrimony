/**
 * Unlocks: deciding whether a viewer may see a profile's contact, and what
 * exactly that reveals.
 *
 * Spec sections 13, 17, 21 and 38. Without this file a `ContactUnlock` row is
 * inert: the webhook mints one, nothing reads it, and the buyer pays for
 * nothing. This is the enforcement half of Phase 4.
 *
 * The shape of the answer is the spec's, not ours, and it is deliberate:
 *
 *   * Section 38 — a locked profile is returned as a *200* carrying the paywall
 *     preview, not a 403. The app renders the locked card and the unlock price
 *     from one response; a 403 would make it synthesise both from an error.
 *   * Section 13 — `HIDDEN_BEFORE_PAYMENT` is the list of fields the locked
 *     response must not contain. It is asserted against the response in tests
 *     rather than trusted by inspection, because a field added to a DTO later is
 *     exactly how this kind of leak happens.
 *   * Section 17 — contact is returned only while an unlock is active, and the
 *     response is sent `Cache-Control: no-store` so the app cannot persist it.
 *   * Section 21 — an anonymised owner's contact is withheld with a reason
 *     rather than silently omitted, so the app can say why.
 *
 * Authorisation order matters and is load-bearing: existence, then visibility
 * scope, then blocks, then the unlock. A viewer who has lost visibility of a
 * profile they once paid for does not get contact access, because the unlock was
 * permission to *see* a card, not a permanent licence to its private fields.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '../prisma/prisma-client';
import { ClockService } from '../common/clock/clock.service';
import { StorageService } from '../storage/s3.service';
import { VisibilityPreferenceService } from '../discovery/visibility-preference.service';
import {
  isUnlockActive,
  quotePayment,
  remainingMs,
  toDecimal,
  type ExpiredUnlockResponse,
  type FullProfile,
  type LockedProfileResponse,
  type PreviewPhoto,
  type UnlockListResponse,
  type UnlockPrice,
  type UnlockedProfileResponse,
  type UnlockSummary,
} from '@matrimony/shared';

/** The profile row plus its owner, as both views need. */
type Target = Awaited<ReturnType<UnlockService['loadTarget']>>;

@Injectable()
export class UnlockService {
  private readonly logger = new Logger(UnlockService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: ClockService,
    private readonly storage: StorageService,
    private readonly preferences: VisibilityPreferenceService,
  ) {}

  /**
   * The profile view: everything the viewer is entitled to see, and nothing
   * more.
   *
   * One method rather than two endpoints, because the decision must be made on
   * the server. Two endpoints would let a client ask for the unlocked one and be
   * refused, which is the same outcome — except the client would then have to be
   * trusted not to have cached the locked fields it already has.
   */
  async view(
    viewerId: string,
    profileId: string,
  ): Promise<UnlockedProfileResponse | LockedProfileResponse | ExpiredUnlockResponse> {
    const target = await this.loadTarget(viewerId, profileId);
    const photos = await this.photosFor(target.id);

    const unlock = await this.prisma.contactUnlock.findFirst({
      where: { userId: viewerId, profileId: target.id },
      orderBy: { createdAt: 'desc' },
    });

    const now = this.clock.now();
    if (unlock && isUnlockActive(unlock.unlockExpiresAt, now, unlock.status)) {
      return {
        profile_id: target.id,
        photos,
        full_profile: this.fullProfile(target),
        contact: this.contactFor(target),
        profile_locked: false,
        unlock_expires_at: unlock.unlockExpiresAt.toISOString(),
      };
    }

    const price = await this.priceFor(target.user.networthCategory);
    const locked = {
      profile_id: target.id,
      photos,
      swagotra: target.swagotra,
      maternal_gothra: target.maternalGothra,
      date_of_birth: target.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      time_of_birth: target.timeOfBirth,
      religion: target.religion,
      age: ageInYears(target.dateOfBirth, now),
      profile_locked: true as const,
      unlock_price: price,
    };

    // Section 38's `previously_unlocked` lets the app show "expired" copy rather
    // than a first-time paywall for someone who has paid before.
    return unlock ? { ...locked, previously_unlocked: true as const } : locked;
  }

  /** The caller's own unlocks, newest first. */
  async listUnlocks(viewerId: string): Promise<UnlockListResponse> {
    const now = this.clock.now();
    const rows = await this.prisma.contactUnlock.findMany({
      where: { userId: viewerId },
      orderBy: { createdAt: 'desc' },
      include: {
        profile: {
          select: {
            firstName: true,
            lastName: true,
            status: true,
            visibility: true,
            deletedAt: true,
          },
        },
      },
    });

    const items: UnlockSummary[] = rows.map((row) => {
      const active = isUnlockActive(row.unlockExpiresAt, now, row.status);
      return {
        profile_id: row.profileId,
        // Suppressed once inactive, and suppressed entirely if the profile is
        // gone: the list must not outlive the privacy decision that created it.
        display_name:
          active && row.profile && this.profileIsReadable(row.profile)
            ? [row.profile.firstName, row.profile.lastName].filter(Boolean).join(' ')
            : null,
        status: this.effectiveStatus(row.unlockExpiresAt, now, row.status),
        unlocked_at: row.unlockedAt.toISOString(),
        unlock_expires_at: row.unlockExpiresAt.toISOString(),
        remaining_ms: remainingMs(row.unlockExpiresAt, now),
      };
    });

    return { items };
  }

  /**
   * Close out unlocks whose window has passed.
   *
   * Access is already denied without this — `isUnlockActive` compares against the
   * window on every read — so this is about the *record* being honest for
   * reconciliation and for the reminder in section 15, not about security.
   * Kept as a plain method with a timer in the module so it can be called
   * directly in a test and by an admin without a scheduler existing yet.
   */
  async expireDue(): Promise<number> {
    const now = this.clock.now();
    if (!this.prisma?.contactUnlock?.updateMany) {
      return 0;
    }
    const { count } = await this.prisma.contactUnlock.updateMany({
      where: { status: 'ACTIVE', unlockExpiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    if (count > 0) this.logger.log(`Marked ${count} unlock(s) expired.`);
    return count;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Load a profile the viewer is entitled to know exists.
   *
   * Every rejection path returns the same 404. Distinguishing "no such profile"
   * from "not in your scope" would confirm the existence of profiles outside the
   * viewer's visibility, which section 12 forbids.
   */
  private async loadTarget(viewerId: string, profileId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: {
            id: true,
            networthCategory: true,
            mobile: true,
            isAnonymised: true,
            deletedAt: true,
            status: true,
            blocksInitiated: { select: { blockedId: true } },
            blockedBy: { select: { blockerId: true } },
          },
        },
        communityValue: { select: { value: true } },
        educationValue: { select: { value: true } },
        professionValue: { select: { value: true } },
      },
    });

    if (
      !profile ||
      profile.userId === viewerId ||
      profile.status !== 'APPROVED' ||
      profile.visibility !== 'ACTIVE' ||
      profile.deletedAt !== null
    ) {
      throw new NotFoundException('Profile not found');
    }

    // A block is absolute and is checked before the unlock. If it were checked
    // after, an active unlock would let a blocked pair keep reading a profile the
    // blocker has asked not to see.
    const blocked =
      profile.user.blocksInitiated.some((b) => b.blockedId === viewerId) ||
      profile.user.blockedBy.some((b) => b.blockerId === viewerId);
    if (blocked) throw new NotFoundException('Profile not found');

    if (!(await this.preferences.isDiscoverableBy(viewerId, profile.userId))) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  private profileIsReadable(p: {
    status: string;
    visibility: string;
    deletedAt: Date | null;
  }): boolean {
    return p.status === 'APPROVED' && p.visibility === 'ACTIVE' && p.deletedAt === null;
  }

  /**
   * The reported status, derived from the window rather than echoed from the row.
   *
   * Identical to the rule `getStatus` uses: a row still marked ACTIVE whose
   * window has closed is EXPIRED, because that is the truth a buyer is owed.
   */
  private effectiveStatus(
    expiresAt: Date,
    now: Date,
    status: 'ACTIVE' | 'EXPIRED' | 'REVOKED',
  ): 'ACTIVE' | 'EXPIRED' | 'REVOKED' {
    if (status !== 'ACTIVE') return status;
    return now.getTime() < expiresAt.getTime() ? 'ACTIVE' : 'EXPIRED';
  }

  /**
   * Contact, or the reason there is none.
   *
   * Section 21: an anonymised owner's PII is overwritten at deletion, so the
   * field is reported unavailable with a reason instead of an empty string the
   * app might render as "not provided".
   */
  private contactFor(target: NonNullable<Target>): UnlockedProfileResponse['contact'] {
    const { user } = target;
    if (user.isAnonymised || user.deletedAt !== null) {
      return {
        mobile: '',
        is_available: false,
        hidden_reason: 'This profile is no longer active.',
      };
    }
    return { mobile: user.mobile, is_available: true, hidden_reason: null };
  }

  /**
   * Section 39: everything section 13 withheld, now revealed.
   *
   * Master-list relations are resolved to their values so the app never has to
   * join against the master data, and so a raw id is never sent where a human
   * label belongs.
   */
  private fullProfile(target: NonNullable<Target>): FullProfile {
    const p = target;
    const now = this.clock.now();
    return {
      first_name: p.firstName,
      last_name: p.lastName,
      gender: p.gender,
      age: ageInYears(p.dateOfBirth, now),
      date_of_birth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      time_of_birth: p.timeOfBirth,
      place_of_birth: p.placeOfBirth,
      height_cm: p.heightCm,

      religion: p.religion,
      community: p.communityValue?.value ?? null,
      mother_tongue: p.motherTongue,
      swagotra: p.swagotra,
      maternal_gothra: p.maternalGothra,
      rashi: p.rashi,
      nakshatra: p.nakshatra,
      gan: p.gan,
      manglik_status: p.manglikStatus,

      education: p.educationValue?.value ?? null,
      profession: p.professionValue?.value ?? null,
      company: p.company,
      annual_income: p.annualIncome,
      work_location: p.workLocation,

      fathers_occupation: p.fathersOccupation,
      mothers_occupation: p.mothersOccupation,
      siblings: p.siblings,
      family_location: p.familyLocation,
      family_description: p.familyDescription,

      food_preference: p.foodPreference,
      smoking: p.smoking,
      drinking: p.drinking,
      about_me: p.aboutMe,

      country: p.country,
      state: p.state,
      city: p.city,
    };
  }

  /**
   * Presigned URLs for the approved photos.
   *
   * Minted per request (section 41) and matched to the discovery preview field
   * for field, deliberately: the same profile must not show different photos on
   * the feed and on its own page, or a user who saw a photo is told it never
   * existed.
   *
   * A photo whose URL cannot be signed is dropped rather than sent with a null
   * url. `PreviewPhotoSchema` requires a real URL, so a null would either break
   * validation or force the app to special-case a shape it should never see; and
   * a profile with no signable photo is still a valid profile, rendered without
   * pictures.
   */
  private async photosFor(profileId: string): Promise<PreviewPhoto[]> {
    const photos = await this.prisma.profilePhoto.findMany({
      where: { profileId, status: 'APPROVED' },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        objectKey: true,
        widthPx: true,
        heightPx: true,
        isPrimary: true,
        photoType: true,
      },
    });

    const signed = await Promise.all(
      photos.map(async (photo) => ({
        photo_id: photo.id,
        url: await this.storage.presignDownload(photo.objectKey).catch(() => null),
        width_px: photo.widthPx,
        height_px: photo.heightPx,
        is_primary: photo.isPrimary,
        photo_type: photo.photoType as PreviewPhoto['photo_type'],
      })),
    );

    return signed.filter((photo) => photo.url !== null) as PreviewPhoto[];
  }

  /**
   * The price to show on a locked profile.
   *
   * Derived from the target's band, never supplied by the caller. Failing closed
   * is deliberate: a missing price must surface as an error the app can show as
   * "unavailable", not as a zero-amount purchase.
   */
  private async priceFor(category: string): Promise<UnlockPrice> {
    const row = await this.prisma.pricingConfig.findFirst({
      where: { category, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
      select: { baseAmount: true, gstRate: true },
    });
    if (!row) {
      throw new NotFoundException('Profile not found');
    }

    const quote = quotePayment(row.baseAmount, toDecimal(row.gstRate).mul(100));
    return {
      base_amount: quote.baseAmount,
      gst_rate: quote.gstRate,
      gst_amount: quote.gstAmount,
      total_amount: quote.totalAmount,
      currency: quote.currency as UnlockPrice['currency'],
    };
  }
}

/**
 * Whole years from a date of birth, from server time.
 *
 * Not derived by the app (A1 makes the full DOB visible anyway, so masking age
 * hides nothing) and not computed from a client clock.
 */
function ageInYears(dateOfBirth: Date | null, now: Date): number | null {
  if (!dateOfBirth) return null;
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return age < 0 ? null : age;
}
