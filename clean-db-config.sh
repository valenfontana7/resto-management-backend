#!/bin/bash

# Script para limpiar configuración problemática de BD
# Ejecutar con: bash clean-db-config.sh

echo "🧹 LIMPIANDO CONFIGURACIÓN PROBLEMÁTICA"
echo "======================================="

# Limpiar variables de entorno del sistema
echo "🗑️  Limpiando variables de entorno del sistema..."
unset DATABASE_URL POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB 2>/dev/null || true

# Buscar y mostrar archivos .env
echo ""
echo "📁 Buscando archivos de configuración..."
find . -name "*.env*" -type f 2>/dev/null | head -10

# Backup y limpieza de .env si existe
if [ -f .env ]; then
    echo ""
    echo "⚠️  Archivo .env encontrado. Creando backup..."
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo "✅ Backup creado: .env.backup.$(date +%Y%m%d_%H%M%S)"

    # Mostrar contenido relevante antes de limpiar
    echo ""
    echo "📋 Contenido actual de .env (variables de BD):"
    grep -E "(DATABASE_URL|POSTGRES_)" .env || echo "No se encontraron variables de BD"

    # Preguntar si quiere limpiar
    read -p "¿Quieres limpiar las variables de BD del archivo .env? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Remover líneas de BD del .env
        sed -i '/^DATABASE_URL=/d' .env
        sed -i '/^POSTGRES_/d' .env
        echo "✅ Variables de BD removidas del .env"
    fi
fi

# Limpiar variables de entorno de PM2 si existe
echo ""
echo "📊 Verificando PM2..."
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q resto-backend; then
        echo "⚠️  PM2 tiene proceso resto-backend. Reiniciando sin variables de BD..."
        pm2 delete resto-backend 2>/dev/null || true
        echo "✅ Proceso PM2 eliminado (se reiniciará con docker-compose)"
    fi
fi

# Limpiar contenedores y volúmenes problemáticos
echo ""
echo "🐳 Limpiando Docker..."
docker-compose down 2>/dev/null || true

# Preguntar si quiere limpiar volúmenes
read -p "¿Quieres limpiar volúmenes de Docker (borrará datos de BD)? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Limpiando volúmenes de Docker..."
    docker volume rm $(docker volume ls -q | grep resto 2>/dev/null) 2>/dev/null || true
    echo "✅ Volúmenes limpiados"
fi

echo ""
echo "✅ LIMPIEZA COMPLETADA"
echo ""
echo "🔄 PRÓXIMOS PASOS:"
echo "1. Ejecutar: docker-compose up -d"
echo "2. Verificar: docker logs resto-backend"
echo "3. Probar login: curl -X POST https://tu-dominio/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"test\",\"password\":\"test\"}'"