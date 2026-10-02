import { Injectable, NotFoundException } from '@nestjs/common';
import { ClockService } from '../common/clock/clock.service';
import { PrismaClient, UserStatus } from '../prisma/prisma-client';
import type { CompleteRegistrationInput, CurrentUser } from '@matrimony/shared';

/**
 * Registration and account-state projection.
 *
 * The category assignment is the part with teeth. Section 36 makes the
 * net-worth category server-controlled, and `User.networthCategory` is a
 * non-nullable foreign key — so the category cannot be deferred to a later step
 * without either a partial user row or a nullable column that would weaken the
 * rule. It is therefore taken at registration and never accepted again from the
 * client.
 */
@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: ClockService,
  ) {}

  /**
   * Creates the account for a mobile number whose OTP was just verified.
   *
   * Idempotent on mobile: a retry after a network timeout returns the existing
   * user rather than failing on the unique constraint. Without this, a client
   * that times out mid-request would show the user a registration error for an
   * account that already exists.
   */
  async complete(input: CompleteRegistrationInput): Promise<{ userId: string; created: boolean }> {
    const category = await this.prisma.netWorthCategoryRef.findFirst({
      where: { key: input.networth_category, isActive: true },
      select: { key: true, isDiscoverable: true },
    });

    if (!category) {
      // The client sent a band key that does not exist. This is the one place a
      // category from the client is trusted, so it is checked against the
      // reference table rather than a hardcoded union — new bands must not
      // require an API release.
      throw new NotFoundException('Unknown net-worth category');
    }

    const existing = await this.prisma.user.findUnique({
      where: { mobile: input.mobile },
      select: { id: true },
    });

    if (existing) {
      return { userId: existing.id, created: false };
    }

    const user = await this.prisma.user.create({
      data: {
        mobile: input.mobile,
        networthCategory: category.key,
        // Registration lands here: the phone number is proven, the category is
        // chosen, but D9 still requires the identity check.
        status: UserStatus.PENDING_VERIFICATION,
        isPhoneVerified: true,
        lastLoginAt: this.clock.now(),
      },
      select: { id: true },
    });

    return { userId: user.id, created: true };
  }

  /**
   * Builds the `GET /auth/me` payload.
   *
   * Two things are derived rather than read. `can_discover` is the product's
   * real gate — verified, paid, active — and computing it here means the app
   * cannot get it wrong by checking one field and forgetting another.
   * `profile_complete` likewise answers "should the app send the user back to
   * the profile form", which requires the profile row, not the user row.
   */
  async currentUser(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        mobile: true,
        status: true,
        networthCategory: true,
        isPhoneVerified: true,
        identityVerifiedAt: true,
        setupFeePaidAt: true,
        deletedAt: true,
        profile: { select: { status: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const identityVerified = user.identityVerifiedAt !== null;
    const setupFeePaid = user.setupFeePaidAt !== null;
    const live = user.deletedAt === null && user.status !== UserStatus.DELETED;

    return {
      id: user.id,
      mobile: user.mobile,
      status: user.status,
      networth_category: user.networthCategory,
      is_phone_verified: user.isPhoneVerified,
      identity_verified: identityVerified,
      setup_fee_paid: setupFeePaid,
      can_discover: live && user.status === UserStatus.ACTIVE && identityVerified && setupFeePaid,
      profile_complete: user.profile !== null && user.profile.status !== 'DRAFT',
    };
  }
}
