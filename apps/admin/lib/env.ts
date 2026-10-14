/**
 * The URL of the NestJS admin API.
 *
 * Read from `ADMIN_API_BASE_URL` (server-only). The default matches the API's
 * own defaults: `API_PORT` 4000 and `API_GLOBAL_PREFIX` `api/v1`. A trailing
 * slash is stripped so path joins never double up.
 */
export const API_BASE_URL = (process.env.ADMIN_API_BASE_URL ?? 'http://localhost:4000/api/v1').replace(
  /\/+$/,
  '',
);
