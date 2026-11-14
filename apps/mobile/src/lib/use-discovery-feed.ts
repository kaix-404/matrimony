import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DISCOVERY_PAGE_SIZE,
  type DiscoverySort,
  type TemporaryFilter,
} from '@matrimony/shared';
import { feedItems } from '../data/sample';
import { apiClient } from './api-client';
import { useAuth } from './auth-context';
import { fromDiscoveryCard, fromSample, type FeedCardModel } from './feed-model';

export interface DiscoveryFeedOptions {
  /** Temporary filters (section 10): they narrow the saved preference, never replace it. */
  filters?: TemporaryFilter;
  sort?: DiscoverySort;
}

export interface DiscoveryFeed {
  items: FeedCardModel[];
  /** False while the unauthenticated design preview is showing sample content. */
  isLive: boolean;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  refresh: () => void;
  loadMore: () => void;
  /**
   * Saves or unsaves a card, optimistically.
   *
   * Owned here rather than per card so the icon, the Matches list and the
   * profile page all mean the same thing: one set of ids, one server write.
   */
  toggleShortlist: (profileId: string) => void;
}

/**
 * The home feed.
 *
 * With no session the feed renders the placeholder design content so the
 * layout stays previewable before sign-in. Once a token exists it reads
 * `GET /discovery`, which pages with an opaque cursor and withholds every
 * locked field — so the models it produces are photo + price only.
 *
 * Photo URLs are presigned and short-lived, so the feed refetches rather than
 * caching them across sessions.
 */
export function useDiscoveryFeed(options: DiscoveryFeedOptions = {}): DiscoveryFeed {
  const { token } = useAuth();
  const { filters, sort } = options;
  /**
   * A serialised copy of the filters, so a caller that rebuilds an identical
   * object every render does not restart the feed on each pass. Temporary
   * filters are plain scalars, so the key order is stable for equal input.
   */
  const filterKey = JSON.stringify(filters ?? {});
  const [items, setItems] = useState<FeedCardModel[]>(() => feedItems.map(fromSample));
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The saved profile ids, as a set for O(1) lookups while rendering cards.
   *
   * Read once per session from `GET /shortlist`, which carries ids and
   * timestamps only. The alternative — discovery reporting it per card — would
   * mean widening a payload whose field set is pinned by a test, and asking the
   * Matches list would presign a photo for every saved profile.
   */
  const [shortlistedIds, setShortlistedIds] = useState<ReadonlySet<string>>(() => new Set());

  /** Drops stale responses when the token changes or a newer request starts. */
  const requestId = useRef(0);

  /**
   * The latest options, read at fetch time rather than captured. `fetchPage`
   * is keyed on the token alone so that changing filters restarts through the
   * effect below, while `loadMore` (which is not re-created on every keystroke)
   * still pages against the filters currently applied.
   */
  const optionsRef = useRef({ filters, sort });
  optionsRef.current = { filters, sort };

  const isLive = token !== null;

  const fetchPage = useCallback(
    async (pageCursor: string | null, replace: boolean) => {
      if (!token) return;
      const id = ++requestId.current;
      const { filters: activeFilters, sort: activeSort } = optionsRef.current;
      try {
        const response = await apiClient.getDiscovery(
          {
            limit: DISCOVERY_PAGE_SIZE,
            cursor: pageCursor ?? undefined,
            filters: activeFilters,
            sort: activeSort,
          },
          token,
        );
        if (id !== requestId.current) return;
        setItems((prev) => {
          const mapped = response.items.map(fromDiscoveryCard);
          return replace ? mapped : [...prev, ...mapped];
        });
        setCursor(response.next_cursor);
        setHasMore(response.next_cursor !== null);
      } catch (e) {
        if (id !== requestId.current) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [token],
  );

  useEffect(() => {
    requestId.current += 1;
    if (!token) {
      setItems(feedItems.map(fromSample));
      setCursor(null);
      setHasMore(false);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchPage(null, true).finally(() => setLoading(false));
    // `filterKey` and `sort` are the applied scope: a change here starts a new
    // first page rather than appending profiles that no longer match.
  }, [token, filterKey, sort, fetchPage]);

  useEffect(() => {
    if (!token) {
      setShortlistedIds(new Set());
      return;
    }
    let cancelled = false;
    void apiClient
      .listShortlist(token)
      .then((index) => {
        if (cancelled) return;
        setShortlistedIds(new Set(index.items.map((item) => item.profile_id)));
      })
      .catch(() => {
        // A failed read leaves every icon unsaved. The write is idempotent and
        // the toggle sets its own state, so the feature still works and the
        // next load corrects the icons.
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  /**
   * Flips the icon immediately, then writes.
   *
   * A bookmark is a one-bit decision, so waiting on a round trip to fill the
   * icon reads as a dropped tap. A failure puts the icon back, which is the only
   * case where the server's answer matters more than the tap.
   */
  const toggleShortlist = useCallback(
    (profileId: string) => {
      if (!token) return;
      const wasSaved = shortlistedIds.has(profileId);

      setShortlistedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(profileId);
        else next.add(profileId);
        return next;
      });

      const request = wasSaved
        ? apiClient.removeFromShortlist(profileId, token)
        : apiClient.addToShortlist(profileId, token);

      void request.catch(() => {
        setShortlistedIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(profileId);
          else next.delete(profileId);
          return next;
        });
      });
    },
    [token, shortlistedIds],
  );

  const refresh = useCallback(() => {
    if (!token) return;
    setRefreshing(true);
    setError(null);
    fetchPage(null, true).finally(() => setRefreshing(false));
  }, [token, fetchPage]);

  const loadMore = useCallback(() => {
    if (!token || !hasMore || cursor === null || loading || refreshing || loadingMore) return;
    setLoadingMore(true);
    fetchPage(cursor, false).finally(() => setLoadingMore(false));
  }, [token, cursor, hasMore, loading, refreshing, loadingMore, fetchPage]);

  /**
   * The cards, with the bookmark state merged in.
   *
   * Merged at the boundary so a saved card cannot be rendered from a model that
   * never knew about shortlists. Sample content has no ids in the set, so the
   * signed-out preview simply renders without a filled icon.
   */
  const viewItems = useMemo(
    () => items.map((item) => ({ ...item, shortlisted: shortlistedIds.has(item.id) })),
    [items, shortlistedIds],
  );

  return {
    items: viewItems,
    isLive,
    loading,
    refreshing,
    loadingMore,
    error,
    refresh,
    loadMore,
    toggleShortlist,
  };
}
