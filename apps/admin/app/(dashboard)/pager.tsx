import Link from 'next/link';

/**
 * Cursor paging for the admin lists.
 *
 * The lists are cursor-paged rather than offset-paged because rows keep arriving
 * at the top while an administrator reads: with an offset, resolving or receiving
 * one row would shift another across the page boundary and show it twice or not
 * at all. The cursor is the id of the last row on screen, so "next" continues
 * exactly where the reader stopped.
 *
 * It renders nothing at all when there is neither a next page nor a page behind,
 * so a short list has no pager to explain.
 */
export function Pager({
  path,
  nextCursor,
  cursor,
  filters,
}: {
  path: string;
  nextCursor: string | null;
  /** The cursor this page was rendered with, which makes a "first page" link. */
  cursor?: string;
  /**
   * The active filters, carried into both links so paging cannot change what is
   * being read halfway down a result set.
   */
  filters?: Record<string, string | undefined>;
}) {
  if (nextCursor === null && cursor === undefined) {
    return null;
  }

  const href = (nextCursorValue?: string): string => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(filters ?? {})) {
      if (value !== undefined && value.length > 0) {
        search.set(key, value);
      }
    }
    if (nextCursorValue !== undefined) {
      search.set('cursor', nextCursorValue);
    }
    const query = search.toString();
    return query.length > 0 ? `${path}?${query}` : path;
  };

  return (
    <div className="actions">
      {cursor !== undefined ? (
        <Link className="btn-link" href={href()}>
          &larr; First page
        </Link>
      ) : null}
      {nextCursor !== null ? (
        <Link className="btn-link" href={href(nextCursor)}>
          Next page &rarr;
        </Link>
      ) : null}
    </div>
  );
}
