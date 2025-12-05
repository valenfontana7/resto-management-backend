#!/bin/bash

echo "🔍 Verificando servidor..."
curl -s http://localhost:4000/ > /dev/null
if [ $? -ne 0 ]; then
  echo "❌ El servidor no está corriendo en http://localhost:4000"
  echo "   Ejecuta: npm run start:dev"
  exit 1
fi

echo "✅ Servidor corriendo"
echo ""

echo "🔍 Verificando archivos en uploads/dishes/..."
FILES=$(ls -1 uploads/dishes/ 2>/dev/null | grep -v "^total" | head -1)
if [ -z "$FILES" ]; then
  echo "❌ No hay archivos en uploads/dishes/"
  exit 1
fi

echo "📁 Archivo encontrado: $FILES"
echo ""

echo "🌐 Probando acceso a archivo estático..."
echo "   URL: http://localhost:4000/uploads/dishes/$FILES"
echo ""

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/uploads/dishes/$FILES)

if [ "$RESPONSE" = "200" ]; then
  echo "✅ Archivo accesible - HTTP 200"
  echo "🎉 Los archivos estáticos están funcionando correctamente!"
else
  echo "❌ Error - HTTP $RESPONSE"
  echo "   Los archivos estáticos NO están configurados correctamente"
  echo ""
  echo "💡 Solución:"
  echo "   1. Asegúrate de que el servidor se haya reiniciado"
  echo "   2. Verifica que main.ts tenga la configuración de useStaticAssets"
fi
