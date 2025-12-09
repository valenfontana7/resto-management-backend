#!/bin/bash

# Script para configurar HTTPS en la API
# Uso: ./setup-https.sh [tu-dominio.com]
# Si no proporcionas dominio, usará nip.io automáticamente

set -e

DOMAIN=$1

if [ -z "$DOMAIN" ]; then
    # Obtener IP pública del servidor
    SERVER_IP=$(curl -s ifconfig.me)
    DOMAIN="api.${SERVER_IP}.nip.io"
    echo "📡 No se proporcionó dominio, usando: $DOMAIN"
fi

echo "🚀 Configurando HTTPS para $DOMAIN..."

# 1. Instalar Certbot
echo "📦 Instalando Certbot..."
apt update
apt install -y certbot python3-certbot-nginx

# 2. Detener Nginx temporalmente
echo "⏸️  Deteniendo Nginx..."
systemctl stop nginx

# 3. Obtener certificado SSL
echo "🔐 Obteniendo certificado SSL..."
certbot certonly --standalone -d $DOMAIN --non-interactive --agree-tos --email valenfontana7@gmail.com

# 4. Crear configuración de Nginx
echo "⚙️  Configurando Nginx..."
cat > /etc/nginx/sites-available/resto-api-https <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept" always;
    add_header Access-Control-Max-Age "3600" always;

    if (\$request_method = 'OPTIONS') {
        return 204;
    }

    access_log /var/log/nginx/resto-api-access.log;
    error_log /var/log/nginx/resto-api-error.log;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    client_max_body_size 10M;
}
EOF

# 5. Activar configuración
echo "🔗 Activando configuración..."
ln -sf /etc/nginx/sites-available/resto-api-https /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 6. Probar configuración
echo "✅ Probando configuración de Nginx..."
nginx -t

# 7. Iniciar Nginx
echo "▶️  Iniciando Nginx..."
systemctl start nginx
systemctl enable nginx

# 8. Configurar firewall
echo "🔥 Configurando firewall..."
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 9. Configurar renovación automática
echo "🔄 Configurando renovación automática..."
systemctl enable certbot.timer
systemctl start certbot.timer

echo ""
echo "✅ ¡HTTPS configurado exitosamente!"
echo ""
echo "🌐 Tu API está disponible en:"
echo "   https://$DOMAIN"
echo ""
echo "🔐 Certificado SSL válido hasta:"
certbot certificates | grep "Expiry Date"
echo ""
echo "📝 Logs disponibles en:"
echo "   /var/log/nginx/resto-api-access.log"
echo "   /var/log/nginx/resto-api-error.log"
echo ""
echo "🔄 El certificado se renovará automáticamente cada 60 días"
