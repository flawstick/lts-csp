# Build stage
FROM oven/bun:1.3.2 AS builder

WORKDIR /app

# Copy workspace config
COPY bun.lock package.json turbo.json ./

# Copy package sources
COPY packages/database ./packages/database
COPY packages/redis ./packages/redis
COPY packages/shared ./packages/shared
COPY containers/task ./containers/task

# Install dependencies
RUN bun install

# Production stage - slim Node image (no browser needed - using Browser Use Cloud API)
FROM oven/bun:1.3.2 AS runner

WORKDIR /app

# Copy from builder
COPY --from=builder /app ./

# Set environment
ENV NODE_ENV=production

WORKDIR /app/containers/task

CMD ["bun", "run", "start"]
