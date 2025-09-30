# Multi-stage Dockerfile for production-ready Mastra application
# Support multi-architecture builds
FROM --platform=$BUILDPLATFORM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
# Git is required for git dependencies like mastra-test-common
RUN apk add --no-cache libc6-compat git openssh-client
WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Copy dependency files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
# For private git repos, you may need to build with --build-arg or secrets
RUN --mount=type=secret,id=github_token \
    if [ -f /run/secrets/github_token ]; then \
        git config --global url."https://oauth2:$(cat /run/secrets/github_token)@github.com/".insteadOf "https://github.com/"; \
    fi && \
    pnpm config set auto-install-peers false && \
    pnpm install --no-frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Install pnpm in builder stage
RUN corepack enable pnpm

# Generate Prisma client
RUN pnpm prisma:generate

# Build the application
RUN pnpm build

# Production image, copy all the files and run mastra
FROM base AS runner
WORKDIR /app

# Add only essential tools for health checks (conditional)
ARG INCLUDE_DEBUG_TOOLS=false
RUN if [ "$INCLUDE_DEBUG_TOOLS" = "true" ]; then \
      apk add --no-cache curl wget; \
    else \
      apk add --no-cache curl; \
    fi

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 mastra

# Copy node_modules from builder (includes Prisma client)
COPY --from=builder --chown=mastra:nodejs /app/node_modules ./node_modules

# Copy source files needed for Prisma
COPY --from=builder --chown=mastra:nodejs /app/src ./src

# Copy built application from .mastra/output
COPY --from=builder --chown=mastra:nodejs /app/.mastra/output ./.mastra/output

USER mastra

EXPOSE 4000

ENV PORT=4000
ENV HOSTNAME="0.0.0.0"

# Health check - use 127.0.0.1 instead of localhost for better container compatibility
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT:-4000}/api/health || exit 1

# Run the built application (mastra build bundles everything including Prisma)
CMD ["node", "--import=./.mastra/output/instrumentation.mjs", ".mastra/output/index.mjs"]