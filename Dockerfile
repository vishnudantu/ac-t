# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
# Install OpenSSL before dependency installation so Prisma detects
# and prepares the correct Linux engine during the build.
RUN apk add --no-cache openssl
WORKDIR /app

FROM base AS deps
# Native addons used by the dependency tree may require these build tools.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Database credentials are runtime-only; never pass DATABASE_URL as a build ARG.
RUN npm run build

FROM base AS migrations
ENV NODE_ENV=production
# The migration runs as node, so give that user ownership of the files.
# This also permits Prisma to manage its engine files if necessary.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node prisma ./prisma
USER node
ENTRYPOINT ["node", "node_modules/prisma/build/index.js"]
CMD ["migrate", "deploy", "--schema", "prisma/schema.prisma"]

FROM node:20-alpine AS runner
# dumb-init handles process signals; OpenSSL is required by Prisma.
RUN apk add --no-cache dumb-init openssl
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Standalone tracing includes the generated Prisma Client and its Linux engine.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --chmod=755 --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"

ENTRYPOINT ["dumb-init", "--", "/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
