#!/bin/bash

# Script de corrección rápida para problemas de BD
# Ejecutar con: bash fix-db.sh

echo "🔧 CORRIENDO CORRECCIONES RÁPIDAS PARA BD"
echo "========================================="

# Detener contenedores
echo "🛑 Deteniendo contenedores..."
docker-compose down

# Crear archivo .env si no existe
if [ ! -f .env ]; then
    echo "📝 Creando archivo .env..."
    cat > .env << 'EOF'
# Database
POSTGRES_PASSWORD=255655

# JWT
JWT_SECRET=tu-jwt-secret-muy-seguro-cambiar-en-produccion

# MercadoPago (configurar en producción)
MERCADOPAGO_ACCESS_TOKEN=
MP_TOKEN_ENCRYPTION_KEY=

# URLs
FRONTEND_URL=*
BASE_URL=https://tu-dominio.com

# S3/DigitalOcean Spaces (configurar en producción)
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_KEY=
S3_SECRET=

# Otros
NODE_ENV=production
EOF
    echo "✅ Archivo .env creado"
else
    echo "⚠️  Archivo .env ya existe, verificando configuración..."
    if ! grep -q "POSTGRES_PASSWORD" .env; then
        echo "Agregando POSTGRES_PASSWORD al .env..."
        echo "POSTGRES_PASSWORD=255655" >> .env
    fi
fi

# Limpiar datos de PostgreSQL si es necesario
echo "🧹 Limpiando datos de PostgreSQL..."
docker volume rm $(docker volume ls -q | grep resto) 2>/dev/null || true

# Reiniciar servicios
echo "⬆️  Reiniciando servicios..."
docker-compose up -d db

echo "⏳ Esperando que PostgreSQL esté listo..."
sleep 10

# Verificar que PostgreSQL esté funcionando
if docker exec resto-postgres pg_isready -U resto_user -d resto_db >/dev/null 2>&1; then
    echo "✅ PostgreSQL está listo"

    # Ejecutar migraciones
    echo "🗄️  Ejecutando migraciones..."
    docker-compose run --rm app npx prisma migrate deploy --schema=prisma/schema.prisma

    # Iniciar aplicación
    echo "🚀 Iniciando aplicación..."
    docker-compose up -d app

    echo ""
    echo "✅ CORRECCIÓN COMPLETADA"
    echo "Verifica que la aplicación esté funcionando en: https://tu-dominio.com"
    echo "Si aún hay problemas, ejecuta: bash diagnose-db.sh"

else
    echo "❌ PostgreSQL no está respondiendo. Revisa los logs:"
    echo "docker logs resto-postgres"
fi