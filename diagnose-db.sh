#!/bin/bash

# Script de diagnóstico para problemas de conexión a BD en VPS
# Ejecutar con: bash diagnose-db.sh

echo "🔍 DIAGNOSTICANDO PROBLEMAS DE CONEXIÓN A BASE DE DATOS"
echo "======================================================"

# Verificar variables de entorno
echo ""
echo "📋 VARIABLES DE ENTORNO:"
echo "POSTGRES_USER: ${POSTGRES_USER:-resto_user}"
echo "POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-(no configurada)}"
echo "POSTGRES_DB: ${POSTGRES_DB:-resto_db}"
echo "DATABASE_URL: ${DATABASE_URL:-(no configurada)}"

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

# Verificar estado de Docker
echo ""
echo "🐳 ESTADO DE DOCKER:"
if command -v docker &> /dev/null; then
    echo "Docker containers corriendo:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

    echo ""
    echo "Estado del contenedor de PostgreSQL:"
    if docker ps | grep -q resto-postgres; then
        docker exec resto-postgres pg_isready -U resto_user -d resto_db && echo "✅ PostgreSQL está listo" || echo "❌ PostgreSQL no responde"
    else
        echo "❌ Contenedor resto-postgres no está corriendo"
    fi
else
    echo "❌ Docker no está instalado"
fi

# Verificar conectividad
echo ""
echo "🔗 PRUEBA DE CONECTIVIDAD:"
if command -v psql &> /dev/null; then
    echo "Probando conexión local a PostgreSQL..."
    PGPASSWORD="${POSTGRES_PASSWORD:-255655}" psql -h localhost -U "${POSTGRES_USER:-resto_user}" -d "${POSTGRES_DB:-resto_db}" -c "SELECT version();" &>/dev/null && echo "✅ Conexión local exitosa" || echo "❌ Error en conexión local"
else
    echo "psql no disponible para pruebas locales"
fi

# Verificar logs recientes
echo ""
echo "📜 LOGS RECIENTES DE DOCKER (últimas 20 líneas):"
if command -v docker &> /dev/null && docker ps | grep -q resto-backend; then
    docker logs --tail 20 resto-backend 2>&1 | grep -E "(error|Error|ERROR|FATAL|password|authentication)" || echo "No se encontraron errores relevantes en logs recientes"
else
    echo "No se puede acceder a logs del contenedor backend"
fi

echo ""
echo "💡 RECOMENDACIONES:"
echo "1. Asegúrate de que DATABASE_URL use 'resto_user' como usuario"
echo "2. Verifica que POSTGRES_PASSWORD esté configurada correctamente"
echo "3. Reinicia los contenedores: docker-compose down && docker-compose up -d"
echo "4. Si el problema persiste, elimina el archivo .env y usa las variables de docker-compose.yml"

echo ""
echo "🔧 COMANDOS PARA CORREGIR:"
echo "# Detener contenedores"
echo "docker-compose down"
echo ""
echo "# Verificar/crear archivo .env correcto"
echo "cat > .env << 'EOF'"
echo "POSTGRES_PASSWORD=255655"
echo "JWT_SECRET=tu-jwt-secret-seguro"
echo "# ... otras variables necesarias"
echo "EOF"
echo ""
echo "# Reiniciar servicios"
echo "docker-compose up -d"