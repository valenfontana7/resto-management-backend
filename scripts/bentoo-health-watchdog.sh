#!/bin/bash
# Minimal Bentoo API health watchdog — logs failures for ops review.
LOG=/var/log/bentoo-health.log
URL="${BENTOO_HEALTH_URL:-http://127.0.0.1:4000/api/health}"
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HTTP_CODE=$(curl -sS -o /tmp/bentoo-health.json -w "%{http_code}" --max-time 8 "$URL" || echo "000")
RESTARTS=$(docker inspect app-app-1 --format "{{.RestartCount}}" 2>/dev/null || echo "?")
STATUS=$(docker inspect app-app-1 --format "{{.State.Status}}" 2>/dev/null || echo "?")
MEM=$(docker stats --no-stream --format "{{.MemUsage}}" app-app-1 2>/dev/null || echo "?")

if [ "$HTTP_CODE" != "200" ]; then
  BODY=$(head -c 300 /tmp/bentoo-health.json 2>/dev/null | tr "\n" " ")
  echo "$TS FAIL http=$HTTP_CODE container=$STATUS restarts=$RESTARTS mem=$MEM body=$BODY" >> "$LOG"
  logger -t bentoo-health "FAIL http=$HTTP_CODE restarts=$RESTARTS status=$STATUS"
  exit 1
fi

# Hourly OK sample for continuity
MINUTE=$(date +%M)
if [ "$MINUTE" = "00" ]; then
  echo "$TS OK http=200 container=$STATUS restarts=$RESTARTS mem=$MEM" >> "$LOG"
fi
exit 0
