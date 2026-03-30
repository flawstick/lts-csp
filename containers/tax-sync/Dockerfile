FROM oven/bun:1.3.2 AS builder

WORKDIR /app

COPY bun.lock package.json turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/portal/package.json apps/portal/package.json
COPY packages/database ./packages/database
COPY packages/redis/package.json packages/redis/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY containers/task/package.json containers/task/package.json
COPY containers/tax-sync ./containers/tax-sync

RUN bun install --frozen-lockfile

FROM oven/bun:1.3.2 AS runner

WORKDIR /app

COPY --from=builder /app ./

ENV NODE_ENV=production

WORKDIR /app/containers/tax-sync

CMD ["bun", "run", "start"]
