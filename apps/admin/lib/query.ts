/**
 * Reads a single query-parameter value.
 *
 * A repeated parameter arrives as an array; the first value wins so a duplicated
 * `?status=OPEN&status=COMPLETED` cannot make a page render a list that matches
 * neither value. An empty string is treated as absent, because `?cursor=` is
 * what an empty form field sends and it must mean "the first page", not a
 * cursor of "" that the API would reject.
 */
export function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value.length === 0 ? undefined : value;
}
