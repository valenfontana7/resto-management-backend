FROM node:22-bookworm AS base
WORKDIR /app

# Allow passing a DATABASE_URL at build time to satisfy prisma when generating the client.
# It's safe to pass a placeholder via --build-arg if you don't want to embed production credentials.
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
ARG BUILD_NODE_OPTIONS=--max-old-space-size=2048
ENV NODE_OPTIONS=${BUILD_NODE_OPTIONS}

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build

FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Prisma needs OpenSSL; fonts for Sharp/librsvg SVG text (placeholders/assets).
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /app/package.json /app/package-lock.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/prisma.config.js ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Normalize CRLF (Windows checkouts) so the entrypoint is executable under Linux.
RUN sed -i 's/\r$//' /app/scripts/docker-entrypoint.sh \
    && chmod +x /app/scripts/docker-entrypoint.sh

RUN set -eux; \
        if ! getent group nodejs >/dev/null 2>&1; then \
            if command -v groupadd >/dev/null 2>&1; then groupadd -g 1001 nodejs; else addgroup --gid 1001 nodejs; fi; \
        fi; \
        if ! id -u nestjs >/dev/null 2>&1; then \
            if command -v useradd >/dev/null 2>&1; then useradd -u 1001 -g 1001 -m -s /usr/sbin/nologin nestjs; \
            else adduser --system --uid 1001 --ingroup nodejs --disabled-password --home /app --shell /usr/sbin/nologin nestjs; fi; \
        fi; \
        chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 4000
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
