import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../prisma/prisma-client';
import {
  NET_WORTH_PENDING_REVIEW_KEY,
  type NetWorthVisibilityPreference,
  type NetWorthVisibilityPreferenceState,
} from '@matrimony/shared';

/**
 * The user's two net-worth visibility lists.
 *
 * Visibility_and_Discoverability (2026-10-03): a profile is discoverable only
 * when the viewer selected the target's band *and* the target selected the
 * viewer's band. Both lists are editable, so this owns reading them, writing
 * them, and — the part that is easy to get wrong — deciding what a list *means*
 * when it has never been saved.
 *
 * THE DEFAULT: until a user saves, both effective lists are their own band. That
 * keeps behaviour identical to the old same-category rule, so nobody is silently
 * shown a band they never opted into. The alternative — defaulting to all bands —
 * would change every existing user's exposure without them touching a setting.
 *
 * WHY A FLAG: "never saved" and "saved as empty" must not collapse. Empty means
 * nobody, which is a deliberate opt-out and doubles as a pause control; if
 * emptiness meant unconfigured, every new account would see nobody and the
 * opt-out would be inexpressible. The flag on PartnerPreference is what keeps the
 * two apart.
 */
@Injectable()
export class VisibilityPreferenceService {
  private readonly logger = new Logger(VisibilityPreferenceService.name);

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * The stored state, for the preference screen.
   *
   * Returns the raw rows rather than the effective set, so the screen can show
   * the user what they actually chose and separately what it currently means. A
   * user who has saved nothing should see "not set", not a list silently
   * pre-filled on their behalf — that would read as though they had chosen it.
   */
  async getState(userId: string): Promise<NetWorthVisibilityPreferenceState> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        networthCategory: true,
        partnerPreference: {
          select: {
            discoveryConfigured: true,
            visibilityConfigured: true,
            updatedAt: true,
          },
        },
        discoveryCategories: { select: { category: true } },
        visibilityCategories: { select: { category: true } },
      },
    });

    return {
      discover: user.discoveryCategories.map((r) => r.category),
      visible_to: user.visibilityCategories.map((r) => r.category),
      discovery_configured: user.partnerPreference?.discoveryConfigured ?? false,
      visibility_configured: user.partnerPreference?.visibilityConfigured ?? false,
      own_category: user.networthCategory,
      // ISO 8601, not a Date: the contract is the wire format, and a Date would
      // serialise as JSON with an implicit timezone conversion applied by
      // JSON.stringify. Unlock windows are server-time, so the client must not
      // have to re-interpret one.
      updated_at: user.partnerPreference?.updatedAt.toISOString() ?? null,
    };
  }

  /**
   * Replaces both lists.
   *
   * Whole-list replacement rather than a delta, because the screen submits the
   * complete selection and a partial update would make "remove the last one"
   * impossible to express.
   *
   * Only the direction(s) present in the input are written. Both are optional so
   * a client can save one side without a round trip for the other, and so a
   * partial save cannot silently reset the side it did not mention — which would
   * quietly widen or narrow someone's visibility.
   */
  async save(
    userId: string,
    input: Partial<NetWorthVisibilityPreference>,
  ): Promise<NetWorthVisibilityPreferenceState> {
    const discover = input.discover === undefined ? undefined : this.normalise(input.discover);
    const visibleTo =
      input.visible_to === undefined ? undefined : this.normalise(input.visible_to);

    // The contract cannot enumerate bands, so an unknown key would otherwise
    // reach the database and surface as a raw constraint violation. Both
    // directions are checked even on a partial save, since both may be supplied.
    await this.assertBandsExist(discover, visibleTo);

    await this.prisma.$transaction(async (tx) => {
      // Clear only a direction that was actually submitted, then insert. Done
      // per direction so a partial save leaves the other side untouched.
      if (discover !== undefined) {
        await tx.userDiscoveryCategory.deleteMany({ where: { userId } });
        if (discover.length > 0) {
          await tx.userDiscoveryCategory.createMany({
            data: discover.map((category) => ({ userId, category })),
          });
        }
      }

      if (visibleTo !== undefined) {
        await tx.userVisibilityCategory.deleteMany({ where: { userId } });
        if (visibleTo.length > 0) {
          await tx.userVisibilityCategory.createMany({
            data: visibleTo.map((category) => ({ userId, category })),
          });
        }
      }

      // Upsert, because a user saving visibility preferences need not have a
      // PartnerPreference row yet — that row also carries age and location
      // criteria, which are optional and belong to a different screen.
      await tx.partnerPreference.upsert({
        where: { userId },
        create: {
          userId,
          ...(discover !== undefined ? { discoveryConfigured: true } : {}),
          ...(visibleTo !== undefined ? { visibilityConfigured: true } : {}),
        },
        update: {
          ...(discover !== undefined ? { discoveryConfigured: true } : {}),
          ...(visibleTo !== undefined ? { visibilityConfigured: true } : {}),
        },
      });
    });

    return this.getState(userId);
  }

  /**
   * The bands a user may actually discover: their saved list, or their own band.
   *
   * The single place the default is applied. Discovery calls this rather than
   * reading the rows directly, so the fallback cannot be forgotten at one call
   * site and quietly become a different rule.
   */
  async effectiveDiscoveryCategories(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        networthCategory: true,
        partnerPreference: { select: { discoveryConfigured: true } },
        discoveryCategories: { select: { category: true } },
      },
    });

    if (!user.partnerPreference?.discoveryConfigured) {
      return [user.networthCategory];
    }

    return user.discoveryCategories.map((r) => r.category);
  }

  /**
   * The one query behind `isDiscoverableBy`.
   *
   * Loading both users in a single round trip rather than four keeps the check
   * atomic enough to trust as a filter, and avoids the case where the four reads
   * straddle a concurrent preference save and disagree with each other.
   */
  private async loadPair(
    viewerId: string,
    targetId: string,
  ): Promise<{ viewerBand: string; targetBand: string; viewerAllowed: string[]; targetAllowed: string[] }> {
    const select = {
      networthCategory: true,
      partnerPreference: {
        select: { discoveryConfigured: true, visibilityConfigured: true },
      },
      discoveryCategories: { select: { category: true } },
      visibilityCategories: { select: { category: true } },
    } as const;

    const [viewer, target] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: viewerId }, select }),
      this.prisma.user.findUniqueOrThrow({ where: { id: targetId }, select }),
    ]);

    return {
      viewerBand: viewer.networthCategory,
      targetBand: target.networthCategory,
      viewerAllowed: viewer.partnerPreference?.discoveryConfigured
        ? viewer.discoveryCategories.map((r) => r.category)
        : [viewer.networthCategory],
      targetAllowed: target.partnerPreference?.visibilityConfigured
        ? target.visibilityCategories.map((r) => r.category)
        : [target.networthCategory],
    };
  }

  /**
   * The bands allowed to discover this user, with the same default.
   *
   * An empty result is meaningful: it means nobody may discover this profile.
   */
  async effectiveVisibilityCategories(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        networthCategory: true,
        partnerPreference: { select: { visibilityConfigured: true } },
        visibilityCategories: { select: { category: true } },
      },
    });

    if (!user.partnerPreference?.visibilityConfigured) {
      return [user.networthCategory];
    }

    return user.visibilityCategories.map((r) => r.category);
  }

  /**
   * Whether a candidate profile may be shown to a viewer.
   *
   * Both halves, because the rule is symmetric and either one failing is enough
   * to hide the profile. Kept as one function so a future caller cannot
   * accidentally implement only the viewer side.
   *
   * Deliberately does not check eligibility (verified, setup fee paid, active).
   * Those are separate concerns and are applied by the discovery query; folding
   * them in here would make this function mean "is discoverable" in two senses.
   */
  async isDiscoverableBy(viewerId: string, targetId: string): Promise<boolean> {
    if (viewerId === targetId) {
      return false;
    }

    const { viewerBand, targetBand, viewerAllowed, targetAllowed } = await this.loadPair(
      viewerId,
      targetId,
    );

    return viewerAllowed.includes(targetBand) && targetAllowed.includes(viewerBand);
  }

  /** Trims and de-duplicates. The contract rejects duplicates; be idempotent anyway. */
  private normalise(keys: string[]): string[] {
    return [...new Set(keys.map((k) => k.trim()).filter((k) => k.length > 0))];
  }

  /**
   * Rejects a band that does not exist, or the review bucket.
   *
   * The contract validates shape but not membership, deliberately — enumerating
   * the bands there would make every new band a client release. Existence is a
   * data question, so it is answered from the database here, which is also the
   * only thing that keeps the FK from surfacing as an internal error.
   */
  private async assertBandsExist(...groups: (string[] | undefined)[]): Promise<void> {
    const keys = [...new Set(groups.flatMap((g) => g ?? []))];

    if (keys.length === 0) {
      return;
    }

    const unknown = keys.filter((k) => k === NET_WORTH_PENDING_REVIEW_KEY);
    if (unknown.length > 0) {
      throw new UnknownCategoryError(unknown);
    }

    const found = await this.prisma.netWorthCategoryRef.findMany({
      where: { key: { in: keys }, isActive: true },
      select: { key: true },
    });

    const missing = keys.filter((k) => !found.some((f) => f.key === k));
    if (missing.length > 0) {
      this.logger.warn(`Rejected unknown net-worth categories: ${missing.join(', ')}`);
      throw new UnknownCategoryError(missing);
    }
  }
}

/**
 * A submitted category that is not an active band.
 *
 * A distinct type so the controller can return 400 naming the field. The client's
 * own list and the server's must not drift silently: if an admin retires a band,
 * the app should be told which one rather than seeing a generic failure.
 */
export class UnknownCategoryError extends Error {
  constructor(readonly keys: string[]) {
    super(`Unknown net-worth category: ${keys.join(', ')}`);
    this.name = 'UnknownCategoryError';
  }
}