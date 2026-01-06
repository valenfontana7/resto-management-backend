#!/bin/bash

echo "=== DIAGNÓSTICO GENERAL DEL SISTEMA ==="
echo ""

echo "1. Estado de servicios principales:"
echo "   - PM2:"
pm2 list 2>/dev/null || echo "   PM2 no está corriendo o no está instalado"

echo "   - Docker:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "   Docker no está disponible"

echo ""
echo "2. Procesos relacionados con la aplicación:"
ps aux | grep -E "(node|nest|prisma|postgres)" | grep -v grep | head -10

echo ""
echo "3. Uso de recursos:"
echo "   Memoria:"
free -h
echo ""
echo "   Disco:"
df -h /

echo ""
echo "4. Conexiones de red activas:"
netstat -tlnp 2>/dev/null | grep -E ":(80|443|3000|5432)" || ss -tlnp | grep -E ":(80|443|3000|5432)"

echo ""
echo "5. Logs recientes del sistema (últimas 10 líneas):"
journalctl -n 10 --no-pager 2>/dev/null || echo "   journalctl no disponible"

echo ""
echo "=== FIN DEL DIAGNÓSTICO ==="