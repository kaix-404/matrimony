# Networth Matrimony

A matrimony platform where matches are grouped by net-worth band. Each band has
its own unlock price, and the price of unlocking a profile is set by the **target's**
band rather than the viewer's.

Discovery is two-way: a profile appears only when the viewer has chosen to see the
target's band _and_ the target has allowed the viewer's band. Both selections are
preferences the user controls, and a user who has never set them sees only their own
band. See
[docs/decisions/visibility-discoverability-2026-10-03.md](docs/decisions/visibility-discoverability-2026-10-03.md).

The repository is a TypeScript monorepo: a NestJS API, a shared domain package,
and local infrastructure. The mobile app and admin dashboard are planned but not
yet scaffolded.

## Status

This is a working foundation, not a finished product. What exists:

- the full domain schema (31 tables) and the client's confirmed business rules,
- the shared contracts that the API and the future apps will both compile against,
- the API's configuration, health, validation, rate limiting and database wiring,
- registration, sign-in and session rotation, with single-use OTP verification,
  account lockout, and rotation that respects suspension and erasure,
- profile editing, master data, and direct-to-storage photo upload,
- CI that migrates and seeds a real database, boots the API and checks readiness.

What does not exist yet: discovery, payments, unlock delivery, notifications and the
admin dashboard.

Unresolved client questions are tracked in
[docs/decisions/client-answers-2026-09-29.md](docs/decisions/client-answers-2026-09-29.md).
Read that file before implementing anything in the affected area — several
answers need confirmation before code is written against them.

## Layout

```
apps/api            NestJS API
packages/shared     Domain types, Zod contracts and pricing rules
infra/docker        Local Postgres, Redis and MinIO
docs/spec           The specification and the client questionnaire
docs/decisions      Client answers and the questions still open
```

## Requirements

- Node.js 22.6 or newer (see `.nvmrc`)
- Docker Desktop, for the local services

## Setup

```bash
npm install
cp .env.example .env          # then fill in the three signing secrets
npm run dev                   # start Postgres and Redis
npm run build -w @matrimony/shared
npm run prisma:generate
npm run prisma:deploy         # apply migrations
npm run prisma:seed           # load reference data
npm run build -w @matrimony/api
node apps/api/dist/main.js
```

On PowerShell, `cp` is `Copy-Item`.

`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `OTP_HASH_SECRET` have no usable
defaults. Generate one value per secret, for example `openssl rand -base64 48`.
The API refuses to start when any of them is missing, which is deliberate.

`packages/shared/dist` and the generated Prisma client are both gitignored, so
a fresh clone does not typecheck until `build -w @matrimony/shared` and
`prisma:generate` have run.

`npm run setup` runs the install, generate, migrate and seed steps in one go. It
assumes the containers are already up and `.env` exists.

The API listens on `http://localhost:4000/api/v1` by default.

The `.env` at the repository root is loaded by the API and by the Prisma CLI
alike, so it is found whether a command runs from the root or from `apps/api`.
Real environment variables always take precedence, so CI and container
deployments inject their own values, and a missing `.env` is ignored rather
than fatal.

### Object storage is opt-in

`npm run dev` starts Postgres and Redis only. The API boots and passes
readiness without object storage; it is needed solely for real photo uploads.

MinIO Community Edition is now distributed as source only — the repository was
archived and its Docker Hub images were removed — so `minio/minio` and
`minio/mc` can no longer be pulled. Leaving them in the default service set made
`npm run dev` fail outright and take Postgres and Redis down with it, so they now
live behind a compose profile:

```bash
MINIO_IMAGE=<mirror>/minio:latest MINIO_MC_IMAGE=<mirror>/mc:latest npm run dev:storage
```

Supply images you trust. Choosing what replaces MinIO locally is still open, and
it interacts with GAP-11 in `docs/decisions`, so no vendor has been picked here.

The database is published on host port **5433**, not 5432. A locally installed
PostgreSQL usually owns 5432, and when it does, host connections silently reach
that server and fail with a misleading "authentication failed" for credentials
that are actually correct. Override `POSTGRES_PORT` in `.env` if 5433 is taken.

## VS Code

Copy the example configs to the real names, then use F5 and the task runner:

```bash
cp .vscode/launch.json.example .vscode/launch.json
cp .vscode/tasks.json.example .vscode/tasks.json
cp .vscode/extensions.json.example .vscode/extensions.json
cp .vscode/settings.json.example .vscode/settings.json
```

They are committed as `*.example` on purpose. `.gitignore` keeps `.vscode/*`
untracked so no editor configuration is imposed on anyone, while the examples
remain shareable.

- **Tasks: Run Task** → `dev: first run` performs the one-time setup, and
  `shared: watch` rebuilds the shared package on change.
- **F5** offers `API: debug compiled`, which waits for the debugger so the first
  statement is hit, and `API: watch and debug`, which rebuilds through
  `nest start --watch`. Both open `http://localhost:4000/api/v1/health/ready`
  once the API is listening.
- `API: attach to 9229` attaches to an API you started yourself, for example
  with `npm run dev -w @matrimony/api -- --debug`.

`@matrimony/shared` is consumed through its gitignored `dist/`, so while working
on shared code run `shared: watch` in a second terminal. Without it the API keeps
serving the previously built copy, which looks like a stale-cache bug.

## Checks

```bash
npm run verify        # validate schema, generate, typecheck, lint, test, build
npm run test          # unit tests only
npm run lint          # ESLint, all workspaces
npm run format        # Prettier
```

`npm run verify` is what CI runs, minus the database steps.

## Prisma

The client is generated with the `prisma-client` generator into
`apps/api/src/generated/prisma`, which is gitignored. Run
`npm run prisma:generate` after a fresh clone or a schema change.

Do not switch this to the deprecated `prisma-client-js` generator. That
generator emits a stub declaring `PrismaClient: any`, with no model types or
enums, which would let field-name typos compile and every query go unchecked.

The schema uses the driver adapter (`@prisma/adapter-pg`) rather than a
`url` in `datasource`, because Prisma 7 removed `url` from the schema. The
connection string is passed at runtime and read from `DATABASE_URL`.

## Design rules

These are enforced in code and tests, not just documented.

- **Money is never a float.** Amounts are `Decimal`/`bigint`, and totals are
  computed with `Decimal`, not JavaScript number arithmetic.
- **Expiry is server time.** Unlock windows are computed from `ClockService`,
  never a client timer, and a backwards clock jump fails readiness.
- **Visibility is closed, not open.** The locked and unlocked profile responses
  are exact schemas. A test fails if a field is added to the pre-payment
  response without a deliberate decision, because the default must be "hidden".
- **One validation language.** Requests are validated with the same Zod schemas
  the apps consume, via `ZodValidationPipe`. Nest's `ValidationPipe` is not used:
  it needs `class-validator` and calls `process.exit(1)` when it is missing.

## Net-worth bands

Bands are rows in the database, not enum members, because the client expects to
add more. `PENDING_REVIEW` is a non-discoverable row. Adding a band is an insert,
not a migration plus an application release.

| Key                 | Range            | Unlock price | With 18% GST |
| ------------------- | ---------------- | ------------ | ------------ |
| `BELOW_2CR`         | below ₹2 Cr      | ₹99          | ₹116.82      |
| `TWO_CR_TO_FIVE_CR` | ₹2 Cr – ₹5 Cr    | ₹249         | ₹293.82      |
| `FIVE_CR_TO_TEN_CR` | ₹5 Cr – ₹10 Cr   | ₹499         | ₹588.82      |
| `ABOVE_10CR`        | ₹10 Cr and above | ₹999         | ₹1178.82     |

A net worth falling exactly on a boundary is assigned to the higher band. This
is a working assumption pending confirmation (see the gaps in `docs/decisions`).

## Known issues

- `npm audit` reports four high-severity advisories in Prisma's transitive
  dependencies. The only offered fix downgrades to Prisma 6, which would break
  the typed client described above. Left in place deliberately; revisit when
  Prisma ships a fix.
