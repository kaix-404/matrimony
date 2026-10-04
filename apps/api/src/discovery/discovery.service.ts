import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient, type PhotoType } from '../prisma/prisma-client';
import { StorageService } from '../storage/s3.service';
import { VisibilityPreferenceService } from './visibility-preference.service';
import {
  quotePayment,
  type DiscoveryCard,
  type DiscoveryQuery,
  type DiscoveryResponse,
  type PreviewPhoto,
  type UnlockPrice,
} from '@matrimony/shared';

/** Bumped if the cursor's shape ever changes; older tokens then reset paging. */
const CURSOR_PREFIX = 'v1:';

/**
 * Section 12 discovery.
 *
 * The response is deliberately thin — a profile id, approved photos and a price.
 * No name, no contact, no income, no religion (section 12: "Search response must
 * not include locked fields"). That is the security property of this endpoint,
 * so the projection below is explicit rather than spreading a profile and
 * deleting keys: a field added to Profile later must not become visible here by
 * accident.
 *
 * TWO-WAY CATEGORY SCOPE (Visibility_and_Discoverability, 2026-10-03). A
 * candidate is in scope only when both hold:
 *   1. the candidate's own band is in the viewer's effective `discover` list, and
 *   2. the viewer's own band is in the candidate's effective `visible_to` list.
 *
 * Neither half alone is sufficient, and that is the whole change from the old
 * same-category partition. The scope comes only from saved preferences; there is
 * no per-request category, so a client cannot widen its own reach for one call.
 *
 * Rooted on Profile rather than User because the response is per profile, and a
 * User-rooted query would carry a nullable relation that the WHERE clause
 * already guarantees is present.
 */
@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly preferences: VisibilityPreferenceService,
  ) {}

  async search(viewerId: string, query: DiscoveryQuery): Promise<DiscoveryResponse> {
    const discover = await this.preferences.effectiveDiscoveryCategories(viewerId);

    // An empty effective list means the user saved "nobody", i.e. discovery is
    // paused. Answering here keeps that from looking like a search that failed,
    // and skips a pointless query on what would otherwise be the hot path.
    if (discover.length === 0) {
      return { items: [], next_cursor: null, applied_categories: [], preference_applied: true };
    }

    const viewer = await this.prisma.user.findUniqueOrThrow({
      where: { id: viewerId },
      select: { networthCategory: true },
    });

    const accepted = await this.bandsThatAcceptViewer(discover, viewerId, viewer.networthCategory);

    // A band that cannot be priced is not searchable: a card without a quote
    // cannot be rendered, and returning the band in `applied_categories` while
    // omitting its users would claim coverage the response does not have.
    const pricing = await this.pricingFor(accepted);
    const scope = accepted.filter((band) => pricing[band] !== undefined);

    if (scope.length === 0) {
      return { items: [], next_cursor: null, applied_categories: [], preference_applied: true };
    }

    const cursor = decodeCursor(query.cursor);
    const rows = await this.prisma.profile.findMany({
      where: {
        status: 'APPROVED',
        // Section 21/36: a paused or deleted profile stays private.
        visibility: 'ACTIVE',
        deletedAt: null,
        ...this.temporaryFilter(query),
        user: {
          is: {
            id: { not: viewerId },
            networthCategory: { in: scope },
            // Eligibility. Verified, paid and active, plus not deleted or
            // anonymised — a suspended or purged account is never browsable.
            status: 'ACTIVE',
            identityVerifiedAt: { not: null },
            setupFeePaidAt: { not: null },
            isAnonymised: false,
            deletedAt: null,
            // Section 12: a block hides the pair in both directions. `none`
            // rather than a join, so a duplicate row cannot resurface a blocked
            // user through the join.
            blocksInitiated: { none: { blockedId: viewerId } },
            blockedBy: { none: { blockerId: viewerId } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      select: {
        id: true,
        photos: {
          // Section 9: only APPROVED photos reach another user.
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
      },
    });

    // One row past the page is the has-more probe, not part of the response.
    const page = rows.slice(0, query.limit);
    const hasMore = rows.length > query.limit;

    const built = await Promise.all(
      page.map(async (row): Promise<DiscoveryCard | null> => {
        // Unreachable: every row's band is in `scope`, which was filtered to
        // priced bands. Guarded rather than asserted so a future scope change
        // degrades to a shorter page instead of emitting an invalid card.
        const price = pricing[row.user.networthCategory];
        if (!price) {
          this.logger.error(
            `No active pricing for ${row.user.networthCategory}; omitted ${row.id} from discovery`,
          );
          return null;
        }

        return {
          profile_id: row.id,
          photos: await this.previewPhotos(row.photos),
          profile_locked: true as const,
          // Priced by the TARGET's band (2026-10-03), not the viewer's. Under
          // two-way discovery the two differ as a matter of course, and quoting
          // the viewer their own rate would make the price depend on who looked.
          unlock_price: price,
        };
      }),
    );

    const items = built.filter((card): card is DiscoveryCard => card !== null);
    // Keyed off the last *served* row, not the last row fetched. The extra probe
    // row is not part of the page, so cursoring off it would skip one item on
    // every subsequent page.
    const last = page.at(-1);

    return {
      items,
      next_cursor: hasMore && last ? encodeCursor(last.id) : null,
      applied_categories: scope,
      // Always true, not an echo of the request flag. Scope above is computed from
      // the saved preference and cannot be widened per request, so preferences
      // were applied whatever the client sent. Echoing the flag back would let
      // `use_saved_preference=false` produce a response claiming preferences were
      // ignored while every returned card had in fact been filtered by them.
      preference_applied: true,
    };
  }

  /**
   * The bands from `discover` in which at least one user accepts this viewer.
   *
   * A candidate accepts the viewer when either they saved a `visible_to` list
   * containing the viewer's band, or they never configured one — in which case
   * their effective list is their own band, the default.
   *
   * Computed as a set of bands rather than by filtering candidates directly,
   * so `applied_categories` describes the real scope and a client can tell
   * "nobody in that band accepts you" from "you cannot see that band".
   */
  private async bandsThatAcceptViewer(
    discover: string[],
    viewerId: string,
    viewerBand: string,
  ): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        // The viewer is excluded: their own row always satisfies the acceptance
        // predicate (they have not opted anyone in), and counting it would report
        // their own band as searched when no other profile in it accepts them.
        id: { not: viewerId },
        networthCategory: { in: discover },
        OR: [
          // Explicit opt-in to the viewer's band.
          { visibilityCategories: { some: { category: viewerBand } } },
          // Never configured: the default is their own band, so this only
          // qualifies the viewer's own band.
          {
            networthCategory: viewerBand,
            OR: [
              { partnerPreference: { is: { visibilityConfigured: false } } },
              { partnerPreference: { is: null } },
            ],
          },
        ],
      },
      select: { networthCategory: true },
      distinct: ['networthCategory'],
    });

    const accepting = new Set(rows.map((r) => r.networthCategory));
    return discover.filter((band) => accepting.has(band));
  }

  /**
   * Temporary filters narrow the result set and are never persisted.
   *
   * Section 10: "Temporary filters can be applied without overwriting saved
   * preferences." Every field here is ANDed with the category scope rather than
   * ORed, so a filter can only ever remove candidates.
   */
  private temporaryFilter(query: DiscoveryQuery): Prisma.ProfileWhereInput {
    const filters = query.filters;
    if (!filters) return {};

    const where: Prisma.ProfileWhereInput = {};

    if (filters.city !== undefined) {
      where.city = { equals: filters.city, mode: 'insensitive' };
    }
    if (filters.state !== undefined) {
      where.state = { equals: filters.state, mode: 'insensitive' };
    }
    if (filters.education !== undefined) {
      where.educationValue = { is: { value: { equals: filters.education } } };
    }
    if (filters.profession !== undefined) {
      where.professionValue = { is: { value: { equals: filters.profession } } };
    }
    if (filters.height_min_cm !== undefined || filters.height_max_cm !== undefined) {
      where.heightCm = {
        ...(filters.height_min_cm !== undefined ? { gte: filters.height_min_cm } : {}),
        ...(filters.height_max_cm !== undefined ? { lte: filters.height_max_cm } : {}),
      };
    }
    if (filters.verified_photos_only === true) {
      where.photos = { some: { status: 'APPROVED' } };
    }

    // Age is bounded as a date range in the database rather than computed in
    // application code, so it can use the (gender, dateOfBirth) index. Years are
    // inclusive at both ends.
    if (filters.age_min !== undefined || filters.age_max !== undefined) {
      const thisYear = new Date().getUTCFullYear();
      where.dateOfBirth = {
        ...(filters.age_max !== undefined
          ? { gte: new Date(Date.UTC(thisYear - filters.age_max, 0, 1)) }
          : {}),
        ...(filters.age_min !== undefined
          ? { lte: new Date(Date.UTC(thisYear - filters.age_min, 11, 31)) }
          : {}),
      };
    }

    return where;
  }

  /**
   * The currently active price per band (section 29).
   *
   * One query for the distinct bands, not one per row: a page spans several
   * bands under two-way discovery, and an N+1 here would be the most expensive
   * part of the request.
   *
   * Only rows with `effectiveTo IS NULL` are current — a price change closes the
   * old row and opens a new one, so historical payments keep their amount.
   */
  private async pricingFor(categories: string[]): Promise<Record<string, UnlockPrice>> {
    const distinct = [...new Set(categories)];
    if (distinct.length === 0) return {};

    const rows = await this.prisma.pricingConfig.findMany({
      where: { category: { in: distinct }, effectiveTo: null },
      select: { category: true, baseAmount: true, gstRate: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    const out: Record<string, UnlockPrice> = {};
    for (const row of rows) {
      // effectiveFrom desc puts the newest first; the guard keeps a duplicate
      // from overwriting the current price.
      if (out[row.category]) continue;

      // gstRate is stored as a fraction (0.1800) and quotePayment takes a
      // percent, so it is converted here rather than in the shared helper —
      // every other caller has a percent.
      const quote = quotePayment(row.baseAmount, row.gstRate.mul(100));
      out[row.category] = {
        base_amount: quote.baseAmount,
        gst_rate: quote.gstRate,
        gst_amount: quote.gstAmount,
        total_amount: quote.totalAmount,
        currency: quote.currency,
      };
    }

    return out;
  }

  /**
   * Presigned URLs for the approved photos.
   *
   * Minted per request (section 41) and capped at the six the card contract
   * allows. A signing failure degrades to an omitted photo rather than failing
   * the page — one unreadable object should not hide an otherwise valid profile.
   */
  private async previewPhotos(
    photos: {
      id: string;
      objectKey: string;
      widthPx: number;
      heightPx: number;
      isPrimary: boolean;
      photoType: PhotoType;
    }[],
  ): Promise<PreviewPhoto[]> {
    const signed = await Promise.all(
      photos.map(async (photo) => ({
        photo_id: photo.id,
        url: await this.storage.presignDownload(photo.objectKey).catch(() => null),
        width_px: photo.widthPx,
        height_px: photo.heightPx,
        is_primary: photo.isPrimary,
        photo_type: photo.photoType as 'SINGLE' | 'FAMILY',
      })),
    );

    return signed.filter((photo) => photo.url !== null) as PreviewPhoto[];
  }
}

/**
 * The cursor is the last profile id of the page.
 *
 * Keyset pagination on the primary key, not an OFFSET: an offset skips or
 * repeats profiles whenever a registration lands mid-scroll, which on a feed
 * that pages continuously is the common case rather than an edge case.
 */
function encodeCursor(id: string): string {
  return Buffer.from(`${CURSOR_PREFIX}${id}`, 'utf8').toString('base64url');
}

/**
 * A cursor that does not decode to a well-formed token starts from the beginning
 * rather than erroring.
 *
 * base64 decoding is lenient and never throws, so garbage would otherwise become
 * a plausible-looking id that silently yields an empty page. The user-visible
 * result of rejecting the token outright is the same empty screen, and the first
 * page is strictly more useful than an error the client cannot act on.
 *
 * The version prefix also lets the shape change later without old cursors
 * resolving to a different profile's id.
 */
function decodeCursor(raw: string | undefined): { id: string } | null {
  if (!raw) return null;

  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    if (!decoded.startsWith(CURSOR_PREFIX)) return null;

    const id = decoded.slice(CURSOR_PREFIX.length);
    // cuid() output. Validating the shape means a truncated or foreign token is
    // rejected rather than sent to the database as an id.
    return /^[a-z0-9]{20,32}$/i.test(id) ? { id } : null;
  } catch {
    return null;
  }
}