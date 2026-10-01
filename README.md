# Networth Matrimony

A matrimony platform where matches are grouped by net-worth band. Each band has
its own unlock price, and a user can only ever discover and unlock profiles in
their own band.

The repository is a TypeScript monorepo: a NestJS API, a shared domain package,
and local infrastructure. The mobile app and admin dashboard are planned but not
yet scaffolded.

## Status

This is a working foundation, not a finished product. What exists:

- the full domain schema (29 tables) and the client's confirmed business rules,
- the shared contracts that the API and the future apps will both compile against,
- the API's configuration, health, validation, rate limiting and database wiring,
- CI that migrates and seeds a real database, boots the API and checks readiness.

What does not exist yet: authentication, discovery, payments, photo upload,
notifications and the admin dashboard. No business endpoint has been written.

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
cp .env.example .env          # then fill in the JWT secrets
npm run dev                   # start Postgres, Redis and MinIO
npm run prisma:deploy         # apply migrations
npm run prisma:seed           # load reference data
npm run build -w @matrimony/api
node apps/api/dist/main.js
```

`npm run setup` runs the install, generate, migrate and seed steps in one go. It
assumes the containers are already up and `.env` exists.

The API listens on `http://localhost:4000/api/v1` by default.

The database is published on host port **5433**, not 5432. A locally installed
PostgreSQL usually owns 5432, and when it does, host connections silently reach
that server and fail with a misleading "authentication failed" for credentials
that are actually correct. Override `POSTGRES_PORT` in `.env` if 5433 is taken.

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

| Key | Range | Unlock price | With 18% GST |
| --- | --- | --- | --- |
| `BELOW_2CR` | below ₹2 Cr | ₹99 | ₹116.82 |
| `TWO_CR_TO_FIVE_CR` | ₹2 Cr – ₹5 Cr | ₹249 | ₹293.82 |
| `FIVE_CR_TO_TEN_CR` | ₹5 Cr – ₹10 Cr | ₹499 | ₹588.82 |
| `ABOVE_10CR` | ₹10 Cr and above | ₹999 | ₹1178.82 |

A net worth falling exactly on a boundary is assigned to the higher band. This
is a working assumption pending confirmation (see the gaps in `docs/decisions`).

## Known issues

- `npm audit` reports four high-severity advisories in Prisma's transitive
  dependencies. The only offered fix downgrades to Prisma 6, which would break
  the typed client described above. Left in place deliberately; revisit when
  Prisma ships a fix.
