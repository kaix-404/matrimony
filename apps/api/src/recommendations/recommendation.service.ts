import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../prisma/prisma-client';
import { DiscoveryService } from '../discovery/discovery.service';
import { FeatureFlagsService } from '../common/features/feature-flags.service';
import {
  type RecommendationCard,
  type RecommendationsQuery,
  type RecommendationsResponse,
} from '@matrimony/shared';

/**
 * How many extra candidates to fetch per requested page before scoring.
 *
 * Scoring orders by shared-interest count, which the database cannot express as
 * an `orderBy`, so a bounded pool is scored in application code and the top
 * `limit` returned. The pool is bounded rather than the whole match set: an
 * unbounded fetch is a memory cliff for a well-connected profile. The trade-off
 * is that a very strong match older than the pool is missed; the pool is
 * multiplied generously to keep that rare.
 */
const POOL_MULTIPLIER = 5;
const MAX_POOL = 200;

/**
 * The 'For You' feed (client answers 3, 4, 5, 6, 7).
 *
 * A recommendation is a discovery candidate that also shares a curated interest
 * with the viewer. It inherits the *entire* eligibility and two-way visibility
 * scope from `DiscoveryService` — a profile the viewer could not discover is
 * never recommended — and adds only the interest-overlap filter and ordering.
 *
 * No external model is called (answer 2: start free/local). The scorer is a
 * single seam (`score`) so an embeddings stage can be added behind it later
 * without touching the contract.
 */
@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly discovery: DiscoveryService,
    private readonly flags: FeatureFlagsService,
  ) {}

  async forYou(viewerId: string, query: RecommendationsQuery): Promise<RecommendationsResponse> {
    // Answer 7: dark by default. No candidate is queried when off, so a disabled
    // deployment produces no recommendation data at all.
    if (!this.flags.isEnabled('aiRecommendations')) {
      return { enabled: false, items: [], applied_categories: [], next_cursor: null };
    }

    const { viewerBand, scope, pricing } = await this.discovery.resolveViewerScope(viewerId);

    // Empty scope = discovery is paused or nobody accepts the viewer. Nothing to
    // recommend, and the same reason discovery returns empty.
    if (scope.length === 0) {
      return { enabled: true, items: [], applied_categories: [], next_cursor: null };
    }

    const viewerInterests = await this.viewerInterestKeys(viewerId);
    const viewerSet = new Set(viewerInterests);

    // No interests to match on. The client chose a dedicated tab, so an empty
    // tab is the honest answer rather than silently degrading into a second
    // discovery feed.
    if (viewerSet.size === 0) {
      return { enabled: true, items: [], applied_categories: scope, next_cursor: null };
    }

    const take = Math.min(query.limit * POOL_MULTIPLIER, MAX_POOL);

    const rows = await this.prisma.profile.findMany({
      where: {
        // Eligibility, two-way acceptance and blocks — identical to discovery.
        ...this.discovery.candidateWhere(viewerId, viewerBand, scope),
        // At least one shared interest. The full overlay is scored in code; this
        // pre-filter keeps the pool small enough to score.
        interests: { some: { interestKey: { in: viewerInterests } } },
      },
      // Newest first, so that among equal-score candidates the ordering matches
      // discovery. The sort below is stable, which preserves this for ties.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        photos: {
          where: { status: 'APPROVED' },
          orderBy: { sortOrder: 'asc' },
          take: 6,
          select: {
            id: true,
            objectKey: true,
            widthPx: true,
            heightPx: true,
            isPrimary: true,
            photoType: true,
          },
        },
        user: { select: { networthCategory: true } },
        interests: { select: { interestKey: true } },
      },
    });

    const scored = rows
      .map((row) => ({
        row,
        // Intersection, so a shared key is counted once regardless of either
        // side's duplicates (the tables cannot hold duplicates anyway).
        shared: row.interests.map((r) => r.interestKey).filter((k) => viewerSet.has(k)),
      }))
      .filter((entry) => entry.shared.length > 0);

    // Stable sort: equal scores keep the newest-first order from the query.
    scored.sort((a, b) => b.shared.length - a.shared.length);

    const page = scored.slice(0, query.limit);

    const built = await Promise.all(
      page.map(async ({ row, shared }): Promise<RecommendationCard | null> => {
        // Unreachable while `scope` only contains priced bands; guarded so a
        // future scope change degrades to a shorter page, not an invalid card.
        const price = pricing[row.user.networthCategory];
        if (!price) {
          this.logger.error(
            `No active pricing for ${row.user.networthCategory}; omitted ${row.id} from recommendations`,
          );
          return null;
        }

        return {
          profile_id: row.id,
          photos: await this.discovery.previewPhotos(row.photos),
          profile_locked: true as const,
          unlock_price: price,
          // Sorted so the field is deterministic — the client may render it as
          // reasons (answer 4) or ignore it (answer 6).
          shared_interests: [...shared].sort(),
        };
      }),
    );

    return {
      enabled: true,
      items: built.filter((card): card is RecommendationCard => card !== null),
      applied_categories: scope,
      // Always null: see RecommendationsResponseSchema. Pagination is a follow-up
      // once the overlap ordering is proven stable across pages.
      next_cursor: null,
    };
  }

  /**
   * The viewer's curated interest keys, from their profile.
   *
   * Interests live on the profile, so a user who has not created one has none —
   * and therefore gets an empty 'For You' rather than an error.
   */
  private async viewerInterestKeys(userId: string): Promise<string[]> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { interests: { select: { interestKey: true } } },
    });

    return profile ? profile.interests.map((r) => r.interestKey) : [];
  }
}
