FROM oven/bun:1.3.2 AS builder

WORKDIR /app

COPY bun.lock package.json turbo.json ./
COPY packages/database ./packages/database
COPY containers/tax-sync ./containers/tax-sync

RUN bun install --frozen-lockfile

FROM oven/bun:1.3.2 AS runner

WORKDIR /app

COPY --from=builder /app ./

ENV NODE_ENV=production

WORKDIR /app/containers/tax-sync

CMD ["bun", "run", "start"]
