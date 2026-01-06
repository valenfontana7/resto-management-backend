#!/bin/bash

# Script para verificar configuración de BD en detalle
# Ejecutar con: bash check-env.sh

echo "🔍 VERIFICACIÓN DETALLADA DE CONFIGURACIÓN"
echo "=========================================="

# Verificar variables de entorno del sistema
echo ""
echo "🌍 VARIABLES DE ENTORNO DEL SISTEMA:"
echo "POSTGRES_USER: ${POSTGRES_USER:-(no definida)}"
echo "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-(no definida)}"
echo "POSTGRES_DB: ${POSTGRES_DB:-(no definida)}"
echo "DATABASE_URL: ${DATABASE_URL:-(no definida)}"

# Verificar si hay archivos .env ocultos o con nombres similares
echo ""
echo "📁 ARCHIVOS DE CONFIGURACIÓN:"
ls -la | grep -E "\.env" || echo "No se encontraron archivos .env"

# Verificar si hay variables en /etc/environment
echo ""
echo "⚙️ VARIABLES EN /etc/environment:"
if [ -f /etc/environment ]; then
    grep -E "(DATABASE_URL|POSTGRES_)" /etc/environment || echo "No se encontraron variables de BD en /etc/environment"
else
    echo "/etc/environment no existe"
fi

# Verificar procesos de PostgreSQL
echo ""
echo "🐘 PROCESOS DE POSTGRESQL:"
ps aux | grep postgres | grep -v grep || echo "No se encontraron procesos de PostgreSQL corriendo"

# Verificar si hay múltiples instancias de Docker
echo ""
echo "🐳 INSTANCIAS DE DOCKER:"
docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | grep -E "(postgres|resto)" || echo "No se encontraron contenedores relacionados"

# Verificar logs de Docker más recientes
echo ""
echo "📜 ÚLTIMOS LOGS DE DOCKER (50 líneas):"
if docker ps | grep -q resto-backend; then
    echo "=== LOGS DE resto-backend ==="
    docker logs --tail 20 resto-backend 2>&1 | tail -10
fi

if docker ps | grep -q resto-postgres; then
    echo "=== LOGS DE resto-postgres ==="
    docker logs --tail 20 resto-postgres 2>&1 | tail -10
fi

# Verificar conectividad de red
echo ""
echo "🔗 CONECTIVIDAD:"
if command -v nc &> /dev/null; then
    nc -z localhost 5432 && echo "✅ Puerto 5432 (PostgreSQL) está abierto" || echo "❌ Puerto 5432 no está accesible"
else
    echo "nc (netcat) no disponible para pruebas de conectividad"
fi

# Verificar si hay archivos de configuración de PM2
echo ""
echo "📊 CONFIGURACIÓN PM2:"
if command -v pm2 &> /dev/null; then
    pm2 list
    echo ""
    echo "Variables de entorno de PM2:"
    pm2 show resto-backend 2>/dev/null | grep -A 10 "env:" || echo "No se encontró proceso resto-backend en PM2"
else
    echo "PM2 no está instalado"
fi

echo ""
echo "💡 POSIBLES CAUSAS DEL ERROR:"
echo "1. Archivo .env con DATABASE_URL incorrecto"
echo "2. Variables de entorno del sistema configuradas"
echo "3. Múltiples instancias de la aplicación corriendo"
echo "4. Configuración de PM2 con variables incorrectas"
echo "5. Logs de otra aplicación o instancia anterior"

echo ""
echo "🔧 ACCIONES RECOMENDADAS:"
echo "1. Buscar y eliminar cualquier archivo .env con DATABASE_URL"
echo "2. Verificar 'env' en /etc/environment"
echo "3. Ejecutar: unset DATABASE_URL POSTGRES_USER POSTGRES_PASSWORD"
echo "4. Reiniciar: docker-compose down && docker-compose up -d"