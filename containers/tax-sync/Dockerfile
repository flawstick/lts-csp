# Build stage
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./

# Copy package sources
COPY packages/database ./packages/database
COPY packages/redis ./packages/redis
COPY packages/shared ./packages/shared
COPY containers/tax-sync ./containers/tax-sync

# Install dependencies
RUN pnpm install --frozen-lockfile

# Production stage - lightweight node image (no Playwright needed)
FROM node:20-slim AS runner

RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /app

# Copy from builder
COPY --from=builder /app ./

# Set environment
ENV NODE_ENV=production

WORKDIR /app/containers/tax-sync

CMD ["pnpm", "start"]
