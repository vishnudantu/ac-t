# ACA TicketOps - Production Dockerfile
# Multi-stage build for Next.js application

# ============================================
# Stage 1: Base image with dependencies
# ============================================
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    postgresql-client \
    openssl \
    curl \
    tzdata

# Set timezone
ENV TZ=Asia/Kolkata

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# ============================================
# Stage 2: Install dependencies
# ============================================
FROM base AS deps

# Install all dependencies (including dev for build)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# ============================================
# Stage 3: Build the application
# ============================================
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time environment variables
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_ORG_NAME
ARG DATABASE_URL

ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
ENV NEXT_PUBLIC_ORG_NAME=${NEXT_PUBLIC_ORG_NAME}
ENV DATABASE_URL=${DATABASE_URL}

# Run build
RUN npm run build

# ============================================
# Stage 4: Production runner
# ============================================
FROM node:20-alpine AS runner

# Install runtime dependencies
RUN apk add --no-cache \
    postgresql-client \
    openssl \
    tzdata \
    dumb-init

ENV TZ=Asia/Kolkata
ENV NODE_ENV=production

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Copy entrypoint script
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["dumb-init", "./docker-entrypoint.sh"]
CMD ["node", "server.js"]