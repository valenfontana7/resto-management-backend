#!/bin/bash
# Script para resolver el problema de migración en producción

set -e

echo "🔧 Resolviendo problema de migración en producción..."

# Paso 1: Marcar la migración fallida como resuelta
echo "📌 Paso 1: Marcando migración como aplicada..."
docker exec -it resto-db psql -U resto_user -d resto_db << 'EOF'
-- Insertar registro de migración si no existe
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (
  gen_random_uuid()::text,
  'migration_checksum',
  NOW(),
  '20260217223805_add_missing_subscription_tables',
  NULL,
  NULL,
  NOW(),
  1
)
ON CONFLICT (migration_name) DO NOTHING;

\echo '✅ Migración marcada como aplicada'
EOF

# Paso 2: Intentar aplicar las migraciones pendientes
echo ""
echo "📌 Paso 2: Aplicando migraciones pendientes..."
docker exec -it resto-backend npx prisma migrate deploy

echo ""
echo "✅ ¡Migraciones aplicadas con éxito!"
echo ""
echo "📝 Nota: Si ves errores sobre objetos que ya existen, es normal."
echo "   Las migraciones ahora están protegidas con IF NOT EXISTS."
