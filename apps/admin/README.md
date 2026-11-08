The Next.js dashboard for the matrimony platform. It talks to the NestJS API in `apps/api` and renders its contracts from `@matrimony/shared`.

## Local development

From the repo root:

```bash
npm install
npm run build -w @matrimony/shared
cd apps/admin
npm run dev
```

The dashboard authenticates with the API's admin session endpoints, so it needs the API and its database up (`npm run dev` and `npm run setup` at the repo root) unless you are using the stub below.

## Environment

- `ADMIN_API_BASE_URL` — the admin API's base URL, server-only. Defaults to `http://localhost:4000/api/v1`.

## Working without a database

`dev/stub-api.js` serves a handful of fixed responses for the admin routes, which is enough to render and click through the dashboard when Postgres or Docker is not available:

```bash
cd apps/admin
npm run dev:stub                                # http://127.0.0.1:4999/api/v1
ADMIN_API_BASE_URL=http://127.0.0.1:4999/api/v1 npm run dev
```

It has no auth: every request is treated as the moderator it defines. The queues are in memory, so an approval or a rejection moves rows between tabs exactly as the real service would, and restarting it puts them back.

It mirrors the API only where the console depends on the rules — a rejection needs a reason, a profile is decided once. Anything else it answers optimistically. Treat the pages it shows as evidence that the console renders and posts the right things, not that the API agrees; that is what the API's own tests are for.

## Checks

```bash
npm run typecheck
npm run lint
npm run test     # the pure helpers under lib/
npm run build
```

`lib/` is unit tested; the pages and server actions are covered by `next build` and by looking at them.
