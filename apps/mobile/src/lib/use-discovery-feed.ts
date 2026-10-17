import { useCallback, useEffect, useRef, useState } from 'react';
import { DISCOVERY_PAGE_SIZE } from '@matrimony/shared';
import { feedItems } from '../data/sample';
import { apiClient } from './api-client';
import { useAuth } from './auth-context';
import { fromDiscoveryCard, fromSample, type FeedCardModel } from './feed-model';

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
export function useDiscoveryFeed(): DiscoveryFeed {
  const { token } = useAuth();
  const [items, setItems] = useState<FeedCardModel[]>(() => feedItems.map(fromSample));
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Drops stale responses when the token changes or a newer request starts. */
  const requestId = useRef(0);

  const isLive = token !== null;

  const fetchPage = useCallback(
    async (pageCursor: string | null, replace: boolean) => {
      if (!token) return;
      const id = ++requestId.current;
      try {
        const response = await apiClient.getDiscovery(
          { limit: DISCOVERY_PAGE_SIZE, cursor: pageCursor ?? undefined },
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
  }, [token, fetchPage]);

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

  return {
    items,
    isLive,
    loading,
    refreshing,
    loadingMore,
    error,
    refresh,
    loadMore,
  };
}
