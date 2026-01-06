#!/bin/bash

echo "=========================================="
echo "  DIAGNÓSTICO COMPLETO - RESTO BACKEND"
echo "=========================================="
echo ""

# Ejecutar todos los scripts de diagnóstico
echo "Ejecutando diagnósticos individuales..."
echo ""

if [ -f "diagnose-db.sh" ]; then
    echo "1. Diagnóstico de base de datos:"
    bash diagnose-db.sh
    echo ""
else
    echo "1. Script diagnose-db.sh no encontrado"
fi

if [ -f "check-nginx.sh" ]; then
    echo "2. Verificación de nginx:"
    bash check-nginx.sh
    echo ""
else
    echo "2. Script check-nginx.sh no encontrado"
fi

if [ -f "system-check.sh" ]; then
    echo "3. Verificación general del sistema:"
    bash system-check.sh
    echo ""
else
    echo "3. Script system-check.sh no encontrado"
fi

if [ -f "check-env.sh" ]; then
    echo "4. Verificación de variables de entorno:"
    bash check-env.sh
    echo ""
else
    echo "4. Script check-env.sh no encontrado"
fi

echo "=========================================="
echo "  FIN DEL DIAGNÓSTICO COMPLETO"
echo "=========================================="
echo ""
echo "Si encuentras errores, revisa los logs detallados arriba."
echo "Para correcciones automáticas, ejecuta: bash fix-db.sh"