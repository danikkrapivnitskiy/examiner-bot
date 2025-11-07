# Multi-stage build for production-ready container

# Build arguments for metadata
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION
ARG REPOSITORY_URL
ARG NODE_VERSION=22-slim

# Stage 1: Dependencies
FROM node:${NODE_VERSION} AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma

# Install all dependencies (for build)
RUN npm ci

# Stage 2: Build
FROM node:${NODE_VERSION} AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    g++ \
    make \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source files
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

# Build application
RUN npm run build

# Stage 3: Production
FROM node:${NODE_VERSION} AS production

# Build arguments for metadata (must be declared in each stage where used)
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION
ARG REPOSITORY_URL

# Labels for metadata (OCI standard)
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.authors="Daniil Krapiunitski" \
      org.opencontainers.image.url="${REPOSITORY_URL}" \
      org.opencontainers.image.documentation="${REPOSITORY_URL}" \
      org.opencontainers.image.source="${REPOSITORY_URL}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.vendor="Daniil Krapiunitski" \
      org.opencontainers.image.title="Examiner Bot" \
      org.opencontainers.image.description="Telegram Bot for generating exams from PDF documents"

# Security: Disable package install recommendations and set secure defaults
ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PDF2JSON_DISABLE_LOGS=1 \
    NPM_CONFIG_LOGLEVEL=error \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Install FFmpeg, curl, and build dependencies
# Create app user with no login shell for security
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r nodejs && useradd -r -g nodejs -s /usr/sbin/nologin nodejs

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
# --ignore-scripts prevents husky install from running (husky is in devDependencies)
# --quiet reduces build logs
RUN npm ci --omit=dev --ignore-scripts --no-optional --quiet || npm ci --omit=dev --ignore-scripts --quiet

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
# Copy prisma schema
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Generate Prisma client for production
RUN npx prisma@5 generate

# Create temp directory with proper permissions
# Security: Restrict permissions to nodejs user only
RUN mkdir -p tmp logs && \
    chown -R nodejs:nodejs tmp logs && \
    chmod 750 tmp logs

# Security: Remove write permissions from app directory (except tmp and logs)
RUN chmod -R 555 /app && \
    chmod -R 750 /app/tmp /app/logs

# Switch to non-root user (security best practice)
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Default command (can be overridden by docker-compose for worker)
CMD ["node", "dist/index.js"]
