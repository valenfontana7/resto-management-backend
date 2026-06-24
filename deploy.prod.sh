#!/usr/bin/env sh
# Deploy producción: pull + up + limpieza segura de imágenes viejas.
# Uso: ./deploy.prod.sh
#      SERVICE=app COMPOSE_FILE=docker-compose.prod.yml ./deploy.prod.sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
SERVICE="${SERVICE:-app}"

echo "==> Pull ${SERVICE}"
docker compose -f "$COMPOSE_FILE" pull "$SERVICE"

echo "==> Up ${SERVICE} (detached)"
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans "$SERVICE"

echo "==> Prune imágenes dangling (capas viejas del último pull)"
docker image prune -f

echo "==> Espacio Docker"
docker system df

echo "✅ Deploy listo"
