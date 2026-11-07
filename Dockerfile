# syntax=docker/dockerfile:1

# --- Build stage -------------------------------------------------------------
# NODE_ENV is deliberately NOT set to production here: npm would omit
# devDependencies, and `nest build` needs typescript + @nestjs/cli + prisma.
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# --legacy-peer-deps resolves the @types/react@18 vs react-native@0.76.3
# peer conflict that comes from the mobile workspace being in the tree.
RUN npm install --legacy-peer-deps

COPY . .

# CRITICAL: the generated Prisma client is gitignored, so it is absent from a
# fresh clone. Without this step every Prisma type is missing and the API build
# fails with "Cannot find module '../generated/prisma/client'" plus ~74
# cascading implicit-any errors. `prisma generate` needs no database.
RUN npm run prisma:generate -w @matrimony/api

RUN npm run build -w @matrimony/shared
RUN npm run build -w @matrimony/api

# --- Runtime stage -----------------------------------------------------------
FROM node:22-slim AS runner

ENV NODE_ENV=production

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/src/generated/prisma ./apps/api/src/generated/prisma

# `prisma db seed` runs on every boot (see CMD below), so the seed has to be
# resolvable inside this image. It is plain TypeScript that imports four things:
# prisma.config.ts reads prisma/seed.ts and imports the root-env loader, and the
# seed imports the generated-client barrel and the password hasher. Those are
# exactly the files copied here - the rest of src/ is already compiled into
# dist/, so no other source is needed at runtime.
COPY --from=builder /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=builder /app/apps/api/src/load-env.ts ./apps/api/src/load-env.ts
COPY --from=builder /app/apps/api/src/prisma/prisma-client.ts ./apps/api/src/prisma/prisma-client.ts
COPY --from=builder /app/apps/api/src/common/crypto/password.ts ./apps/api/src/common/crypto/password.ts
# @prisma/client (and its runtime deps) live in the API workspace
# node_modules because hoist-limit=0 keeps them out of the root copy.
# Also copy @prisma/client-runtime-utils which is a peer dep of the
# client that npm did not auto-install into the workspace tree.
COPY --from=builder /app/apps/api/node_modules/@prisma/client ./node_modules/@prisma/client
# @prisma/client-runtime-utils is a peer dep of @prisma/client that npm
# with hoist-limit=0 does not auto-install into the workspace tree. Added
# as a direct dependency of @matrimony/api so it lands in root
# node_modules/@prisma/client-runtime-utils and gets copied by the
# root node_modules COPY above — no separate COPY needed.
# (Kept as an explicit no-op reference for clarity; the root COPY handles it.)

USER nestjs

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/api/v1/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# The boot is: migrate -> seed -> serve. Render's pre-deploy command would be the
# natural home for the first two, but it is a paid-plan feature and this service
# is on the free plan, so they ride on the boot instead.
#
# Migrating first is what makes a schema change safe to ship: `migrate deploy`
# applies only migrations the database has not recorded yet, so on an unchanged
# schema it is a no-op that costs about a second. It is fail-closed - a database
# it cannot migrate stops the boot rather than serving a release whose schema is
# older than its code, and a P3005 (unmanaged schema, no migration history) fails
# with a printed baseline procedure instead of a bare error code.
#
# The seed is idempotent too (every write is an upsert on a natural key), so a
# cold start paying a few seconds for it is cheap, and it never rewrites an
# existing administrator's password. HOME is /tmp because npm needs a writable
# cache and a `--system` user has no home directory.
CMD ["sh", "-c", "HOME=/tmp node apps/api/dist/prisma/migrate-deploy.js && HOME=/tmp npm run prisma:seed -w @matrimony/api && exec node apps/api/dist/main.js"]
