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
# Copiar artefactos desde builder (incluye node_modules con .prisma)
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/prisma.config.js ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Verify dist was copied
RUN ls -la /app/ && ls -la /app/dist/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Change ownership
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 4000
CMD ["node", "dist/main"]