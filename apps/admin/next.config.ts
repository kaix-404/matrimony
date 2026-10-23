import type { NextConfig } from 'next';

/**
 * The admin dashboard is a browser front-end for the NestJS admin API. It holds
 * no business logic of its own: every list and mutation is a thin call to the
 * API, so the permission checks and audit trail that guard those routes are the
 * only authority the dashboard has.
 *
 * Linting is a separate workspace script (`npm run lint`), run by the root
 * `verify` and by CI. Next 16 no longer lints during `next build`, so there is
 * nothing to configure here for it - the two agree by construction.
 *
 * The `dev` and `build` scripts pass `--webpack` to opt out of Turbopack, the
 * Next 16 default. Turbopack panics while writing this app's route chunks on
 * Windows ("failed to convert rope into string / invalid utf-8 sequence", a
 * source-map generation bug); webpack builds the identical app cleanly. Pin the
 * engine here, in the scripts, so local and CI builds agree.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    agentUpgrade: 'security',
  },
};

export default nextConfig;
