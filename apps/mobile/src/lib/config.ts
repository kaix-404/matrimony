import Constants from 'expo-constants';

const EXPO_PUBLIC_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const DEFAULT_API_BASE_URL = 'http://localhost:4000/api/v1';

interface ExpoExtra {
  apiBaseUrl?: string;
}

/**
 * The API base URL to use, given the two places it can be configured.
 *
 * The environment variable wins over `app.json`, which is what the README has
 * always promised and what a build actually needs: `app.json` pins the deployed
 * API, so giving it precedence meant no environment could point a build
 * anywhere else — not a local API, not a staging one. A blank value counts as
 * unset rather than as "the empty URL", since that is how an unpopulated
 * variable arrives.
 */
export function resolveApiBaseUrl(
  fromEnv: string | undefined,
  fromExtra: string | undefined,
): string {
  const candidate = fromEnv || fromExtra || DEFAULT_API_BASE_URL;
  return candidate.replace(/\/+$/, '');
}

function getApiBaseUrl(): string {
  // A browser build is served from the same origin as the landing page, and that
  // origin proxies `/api` to the API (`landing/server.js`). Asking for the API
  // relatively means the web app needs no CORS entry of its own, and it keeps
  // working on whatever hostname the site is deployed to. An explicit
  // `EXPO_PUBLIC_API_BASE_URL` still wins, which is what points `expo start
  // --web` at a local API.
  //
  // `document` rather than `Platform.OS`: this module is plain logic and unit
  // tested, and the test runner has no React Native transform. A browser has a
  // `document`; the native runtime does not.
  if (typeof document !== 'undefined' && !EXPO_PUBLIC_API_BASE_URL) return '/api/v1';

  const extra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;
  return resolveApiBaseUrl(EXPO_PUBLIC_API_BASE_URL, extra.apiBaseUrl);
}

export const config = {
  apiBaseUrl: getApiBaseUrl(),
} as const;
