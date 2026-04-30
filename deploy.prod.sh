#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
SERVICE="${SERVICE:-app}"

docker compose -f "$COMPOSE_FILE" pull "$SERVICE"
docker compose -f "$COMPOSE_FILE" up -d "$SERVICE"
