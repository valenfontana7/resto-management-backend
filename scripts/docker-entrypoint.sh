#!/bin/sh
set -e

echo "[entrypoint] Applying pending Prisma migrations..."
./node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma

echo "[entrypoint] Starting NestJS..."
exec node dist/main
