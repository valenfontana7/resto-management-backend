# Dockerfile
FROM node:20-bullseye AS builder
WORKDIR /app

# Allow passing a DATABASE_URL at build time to satisfy prisma when generating the client.
# It's safe to pass a placeholder via --build-arg if you don't want to embed production credentials.
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Generar Prisma client en CI/build
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build

FROM node:20-bullseye-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Copiar manifests e instalar deps de producción
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar artefactos desde builder
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/prisma.config.js ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Verify dist was copied
RUN ls -la /app/ && ls -la /app/dist/

# Create non-root user
RUN set -eux; \
        if ! getent group nodejs >/dev/null 2>&1; then \
            if command -v groupadd >/dev/null 2>&1; then groupadd -g 1001 nodejs; else addgroup --gid 1001 nodejs; fi; \
        fi; \
        if ! id -u nestjs >/dev/null 2>&1; then \
            if command -v useradd >/dev/null 2>&1; then useradd -u 1001 -g 1001 -m -s /usr/sbin/nologin nestjs; \
            else adduser --system --uid 1001 --ingroup nodejs --disabled-password --home /app --shell /usr/sbin/nologin nestjs; fi; \
        fi

# Change ownership
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 4000
CMD ["node", "dist/main"]