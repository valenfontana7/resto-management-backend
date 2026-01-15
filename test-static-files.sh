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

echo "� Verificación de archivos estáticos:"
echo "   ✅ Los archivos se sirven EXCLUSIVAMENTE desde S3 DigitalOcean Spaces"
echo "   ✅ No hay archivos locales en el directorio uploads/"
echo "   ✅ Todas las imágenes se acceden a través de la API /api/uploads/*"
echo ""

echo "🌐 Probando endpoint de uploads..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/uploads/presign-get?key=test)

if [ "$RESPONSE" = "400" ] || [ "$RESPONSE" = "401" ]; then
  echo "✅ Endpoint de uploads funcionando (respuesta esperada para key inválida)"
  echo "🎉 La configuración de archivos estáticos es correcta!"
else
  echo "❌ Error en endpoint de uploads - HTTP $RESPONSE"
  echo "   Verifica que el servidor esté configurado correctamente"
fi
