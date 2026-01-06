#!/bin/bash

# Script para verificar estado de nginx y conectividad
# Ejecutar con: bash check-nginx.sh

echo "🌐 VERIFICANDO ESTADO DE NGINX Y CONECTIVIDAD"
echo "=============================================="

# Verificar si nginx está instalado y corriendo
echo ""
echo "🔍 ESTADO DE NGINX:"
if command -v nginx &> /dev/null; then
    echo "✅ Nginx está instalado"

    # Verificar si está corriendo
    if systemctl is-active --quiet nginx; then
        echo "✅ Nginx está corriendo"
    else
        echo "❌ Nginx NO está corriendo"
        echo "Para iniciarlo: sudo systemctl start nginx"
    fi

    # Verificar configuración
    echo ""
    echo "⚙️ CONFIGURACIÓN DE NGINX:"
    sudo nginx -t 2>&1 && echo "✅ Configuración de nginx es válida" || echo "❌ Configuración de nginx tiene errores"

    # Mostrar configuración activa
    echo ""
    echo "📄 SITIOS HABILITADOS:"
    ls -la /etc/nginx/sites-enabled/ 2>/dev/null || echo "No se puede acceder a /etc/nginx/sites-enabled/"

else
    echo "❌ Nginx NO está instalado"
fi

# Verificar conectividad al backend
echo ""
echo "🔗 CONECTIVIDAD AL BACKEND:"
if command -v curl &> /dev/null; then
    # Probar localhost:4000 directamente
    echo "Probando conexión directa al backend (localhost:4000)..."
    if curl -s --max-time 5 http://localhost:4000/api/health > /dev/null 2>&1; then
        echo "✅ Backend responde en localhost:4000"
    else
        echo "❌ Backend NO responde en localhost:4000"
    fi

    # Probar a través de nginx (puerto 80)
    echo ""
    echo "Probando conexión a través de nginx (puerto 80)..."
    if curl -s --max-time 5 -H "Host: tu-dominio.com" http://localhost/api/health > /dev/null 2>&1; then
        echo "✅ Nginx proxy funciona correctamente"
    else
        echo "❌ Nginx proxy NO funciona"
    fi
else
    echo "curl no disponible para pruebas"
fi

# Verificar estado de Docker
echo ""
echo "🐳 ESTADO DE DOCKER:"
if command -v docker &> /dev/null; then
    echo "Contenedores corriendo:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

    echo ""
    echo "Estado específico del backend:"
    if docker ps | grep -q resto-backend; then
        docker inspect resto-backend --format='{{.State.Status}}' 2>/dev/null && echo "✅ Contenedor resto-backend está corriendo" || echo "❌ Contenedor resto-backend tiene problemas"
    else
        echo "❌ Contenedor resto-backend NO está corriendo"
    fi
else
    echo "❌ Docker no está disponible"
fi

# Verificar logs recientes de nginx
echo ""
echo "📜 ÚLTIMOS LOGS DE NGINX (20 líneas):"
if [ -f /var/log/nginx/error.log ]; then
    tail -20 /var/log/nginx/error.log | grep -v " 200 " | tail -10 || echo "No se encontraron errores recientes en nginx"
else
    echo "No se puede acceder a /var/log/nginx/error.log"
fi

# Verificar puertos abiertos
echo ""
echo "🔌 PUERTOS ABIERTOS:"
if command -v netstat &> /dev/null; then
    netstat -tlnp 2>/dev/null | grep -E ":(80|4000) " || echo "Puertos 80 o 4000 no están abiertos"
elif command -v ss &> /dev/null; then
    ss -tlnp | grep -E ":(80|4000) " || echo "Puertos 80 o 4000 no están abiertos"
else
    echo "No se puede verificar puertos (netstat/ss no disponibles)"
fi

echo ""
echo "💡 POSIBLES CAUSAS DEL ERROR 502:"
echo "1. Nginx no está corriendo: sudo systemctl start nginx"
echo "2. Backend no está corriendo: docker-compose up -d"
echo "3. Problemas de conectividad entre nginx y backend"
echo "4. Configuración incorrecta de nginx"
echo "5. Backend fallando al iniciar (problemas de BD)"

echo ""
echo "🔧 ACCIONES RECOMENDADAS:"
echo "1. Verificar nginx: sudo systemctl status nginx"
echo "2. Verificar backend: docker logs resto-backend --tail 20"
echo "3. Reiniciar servicios: docker-compose restart && sudo systemctl restart nginx"
echo "4. Probar conectividad: curl http://localhost:4000/api/health"