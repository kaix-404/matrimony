FROM node:22-slim AS base

ENV NODE_ENV=production

FROM base AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# --legacy-peer-deps resolves @types/react@18.3.31 vs react-native@0.76.3 conflict
RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build -w @matrimony/shared
# Build API with tsc (works locally; nest build fails in Docker CI)
RUN npx tsc -p apps/api/tsconfig.json

FROM base AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/src/generated ./apps/api/src/generated
COPY --from=builder /app/apps/api/package.json ./apps/api/

USER nestjs

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/api/v1/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/api/dist/main.js"]