# 🎯 Comandos Útiles - Resto Management Backend

## 🚀 Despliegue Inicial

### Oracle Cloud (Quick Start)

```bash
# 1. Conectar a VPS
ssh ubuntu@YOUR_VPS_IP

# 2. Clonar y configurar
git clone https://github.com/YOUR_USERNAME/resto-management-backend.git
cd resto-management-backend
chmod +x *.sh

# 3. Setup completo (1 comando)
./setup-vps.sh && ./optimize-oracle.sh && ./quickdeploy.sh

# 4. Configurar .env
nano .env
# Editar: DATABASE_URL, JWT_SECRET, FRONTEND_URL

# 5. Desplegar
./quickdeploy.sh
```

### Docker (Alternativa)

```bash
docker-compose up -d
docker-compose exec app npx prisma migrate deploy
# Seed vacío - no ejecutar en producción
```

---

## 🔄 Actualizaciones

```bash
# PM2
cd /var/www/resto-backend
git pull
./deploy.sh

# Docker
cd /var/www/resto-management-backend
git pull
docker-compose up -d --build
docker-compose exec app npx prisma migrate deploy
```

---

## 🗄️ Comandos útiles: operaciones directas en la DB con `docker exec` + `psql`

> Nota: estos comandos asumen que el contenedor de Postgres se llama `resto-postgres` (ver `docker-compose.yml`). Ajusta el nombre del contenedor, usuario (`-U`) y base de datos (`-d`) según tu entorno.

### Credenciales de Desarrollo

Para desarrollo/testing, usa estas credenciales:

- **Email**: `valenfontana7@gmail.com`
- **Password**: `admin123`
- **Rol**: SUPER_ADMIN

### Crear usuario de desarrollo

Si necesitas crear un nuevo usuario con rol SUPER_ADMIN:

```bash
# 1. Generar hash de contraseña
docker-compose exec app node -e "
const bcrypt = require('bcrypt');
const password = 'admin123';
bcrypt.hash(password, 10).then(hash => console.log('Hash:', hash));
"

# 2. Crear usuario (reemplaza \$HASH_GENERADO)
docker-compose exec db psql -U resto_user -d resto_db -c "
INSERT INTO \"User\" (id, name, email, password, \"roleId\", \"isActive\", \"createdAt\", \"updatedAt\")
SELECT
  gen_random_uuid()::text,
  'Admin User',
  'nuevo-admin@example.com',
  '\$HASH_GENERADO',
  id,
  true,
  now(),
  now()
FROM \"Role\"
WHERE name = 'SUPER_ADMIN' AND \"isSystemRole\" = true;
"
```

## ✅ Verificación de Funcionalidad

### Autenticación

- ✅ Login exitoso con credenciales actualizadas
- ✅ Token JWT generado correctamente
- ✅ Usuario SUPER_ADMIN autenticado

### Creación de Restaurantes

- ✅ Restaurante creado exitosamente con adminEmail
- ✅ Múltiples restaurantes pueden compartir el mismo email de admin
- ✅ Sin errores de restricción de unicidad en emails

## 📋 Estado Actual del Sistema

**Master Admin Panel**: ✅ Completamente funcional

- Autenticación SUPER_ADMIN: ✅
- Creación de restaurantes: ✅
- Gestión de usuarios: ✅
- Emails duplicados permitidos: ✅

**Credenciales de Desarrollo**:

- Email: `valenfontana7@gmail.com`
- Password: `admin123`
- Rol: `SUPER_ADMIN`

### 1) Setear rol `SUPER_ADMIN` para un usuario (por email)

Ejecuta este comando para asignar el rol `SUPER_ADMIN` a un usuario identificado por su email. El comando busca un role de sistema cuyo nombre sea parecido a "super admin" (varias formas) y actualiza el `roleId` del usuario.

```bash
docker exec -i resto-postgres psql -U resto_user -d resto_db -c "WITH r AS (SELECT id FROM \"Role\" WHERE lower(name) IN ('super_admin','super admin','super-admin') AND \"isSystemRole\" = true LIMIT 1) UPDATE \"User\" SET \"roleId\" = (SELECT id FROM r) WHERE lower(email) = lower('user@example.com');"

**Nota**: Si el usuario no existe, créalo primero con una contraseña hasheada.
```

- Reemplaza `user@example.com` por el email real.
- Si tu contenedor de Postgres tiene un nombre distinto, sustituye `resto-postgres`.

### 2) Verificar el cambio

Comprueba que el usuario tiene el `roleId` actualizado y muestra el nombre del role asociado:

```bash
# Ver roleId del usuario
docker exec -i resto-postgres psql -U resto_user -d resto_db -c "SELECT id, email, \"roleId\" FROM \"User\" WHERE lower(email)=lower('user@example.com');"

# Ver nombre del role asignado
docker exec -i resto-postgres psql -U resto_user -d resto_db -c "SELECT id, name FROM \"Role\" WHERE id = (SELECT \"roleId\" FROM \"User\" WHERE lower(email)=lower('user@example.com'));"
```

(Si no existe SUPER_ADMIN ejecutar esto)

docker exec -i resto-postgres psql -U resto_user -d resto_db -c "INSERT INTO \"Role\" (id, name, permissions, color, \"isSystemRole\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid()::text, 'SUPER_ADMIN', '[]'::json, '#ef4444', true, now(), now()) RETURNING id;"

### 3) Rollback (restaurar `roleId` anterior)

Antes de cambiar, puedes guardar el `roleId` actual y, en caso de error, restaurarlo.

```bash
# Guardar roleId previo (ejemplo: en variable shell)
PREV_ROLE_ID=$(docker exec -i resto-postgres psql -U resto_user -d resto_db -t -c "SELECT \"roleId\" FROM \"User\" WHERE lower(email)=lower('user@example.com');" | xargs)

# Para restaurar más tarde (reemplaza $PREV_ROLE_ID si lo guardaste manualmente)
docker exec -i resto-postgres psql -U resto_user -d resto_db -c "UPDATE \"User\" SET \"roleId\" = '${PREV_ROLE_ID}' WHERE lower(email) = lower('user@example.com');"
```

```bash
# Para setear una configuración de un restaurante en particular
docker compose exec -T db psql -U resto_user -d resto_db -c "UPDATE \"Restaurant\" SET \"onboardingIncomplete\" = false, \"updatedAt\" = NOW() WHERE \"slug\" = 'slug'; SELECT \"id\",\"slug\",\"onboardingIncomplete\" FROM \"Restaurant\" WHERE \"slug\" = 'slug';"
```

### 4) Notas y precauciones

- Ejecutar estas operaciones sólo en entornos de desarrollo o con extremo cuidado en producción.
- Algunos despliegues requieren que uses el superusuario `postgres` para `DROP/CREATE` de DB; para updates de filas `resto_user` suele ser suficiente.
- Las comillas dobles en los identificadores de Prisma/PG (`"User"`, `"Role"`) son necesarias si las tablas usan mayúsculas o nombres reservados.

---

## 📊 Monitoreo

### Estado General

```bash
pm2 status                    # Estado de procesos
pm2 logs resto-backend        # Ver logs en tiempo real
pm2 logs --lines 100          # Últimas 100 líneas
pm2 monit                     # Monitor interactivo

docker-compose ps             # Estado de contenedores
docker-compose logs -f app    # Logs en tiempo real
docker stats                  # Uso de recursos
```

### Sistema

```bash
# Recursos
htop                          # CPU y RAM interactivo
free -h                       # Memoria disponible
df -h                         # Espacio en disco
du -sh uploads/              # Tamaño de uploads

# Procesos
ps aux | grep node           # Procesos Node.js
netstat -tlnp | grep 4000    # Puerto 4000
lsof -i :4000                # Qué usa el puerto 4000
```

### Base de Datos

```bash
# Conectar
sudo -u postgres psql resto_management

# Queries útiles
SELECT version();                                    # Versión PostgreSQL
SELECT count(*) FROM "Restaurant";                  # Total restaurantes
SELECT count(*) FROM "Dish";                        # Total platos
SELECT pg_size_pretty(pg_database_size('resto_management'));  # Tamaño DB

# Salir
\q
```

---

## 🔨 Gestión de PM2

### Básicos

```bash
pm2 start ecosystem.config.js --env production
pm2 stop resto-backend
pm2 restart resto-backend
pm2 reload resto-backend      # Restart sin downtime
pm2 delete resto-backend
pm2 save                      # Guardar configuración
```

### Avanzados

```bash
pm2 logs resto-backend --err  # Solo errores
pm2 flush                     # Limpiar logs
pm2 reset resto-backend       # Reset estadísticas
pm2 describe resto-backend    # Info detallada
pm2 list                      # Todos los procesos
```

### Startup

```bash
pm2 startup                   # Configurar auto-start
pm2 save                      # Guardar lista actual
pm2 resurrect                 # Restaurar procesos guardados
pm2 unstartup                 # Remover auto-start
```

---

## 🐳 Gestión de Docker

### Contenedores

```bash
docker-compose up -d              # Iniciar
docker-compose down               # Detener y remover
docker-compose restart            # Reiniciar
docker-compose stop               # Detener (sin remover)
docker-compose start              # Iniciar (ya creados)
```

### Logs

```bash
docker-compose logs -f app        # App logs (seguir)
docker-compose logs -f postgres   # PostgreSQL logs
docker-compose logs --tail=100    # Últimas 100 líneas
```

### Mantenimiento

```bash
docker-compose exec app bash      # Shell en contenedor app
docker-compose exec postgres psql -U resto_user -d resto_management
docker system prune -a            # Limpiar todo (CUIDADO!)
docker volume ls                  # Ver volúmenes
```

### Rebuild

```bash
docker-compose up -d --build      # Rebuild y restart
docker-compose build --no-cache   # Build desde cero
```

---

## 🗄️ Gestión de Base de Datos

### Migraciones

```bash
# PM2
npx prisma migrate dev            # Desarrollo
npx prisma migrate deploy         # Producción
npx prisma migrate status         # Estado

# Docker
docker-compose exec app npx prisma migrate deploy
docker-compose exec app npx prisma migrate status
```

### Prisma Studio

```bash
npx prisma studio                 # Abrir GUI (localhost:5555)

# Con Docker
docker-compose exec app npx prisma studio
# Luego: ssh -L 5555:localhost:5555 ubuntu@YOUR_VPS_IP
```

### Seed (Vacío - No inserta datos mock)

```bash
npm run prisma:seed               # Seed vacío (no datos de prueba)

# Docker
docker-compose exec app npm run prisma:seed
```

### Backup Manual

```bash
./backup.sh                       # Script incluido

# O manual
pg_dump -U resto_user -h localhost resto_management > backup_$(date +%Y%m%d).sql
```

### Restore

```bash
# PM2
psql -U resto_user -h localhost resto_management < backup_20241205.sql

# Docker
docker-compose exec -T postgres psql -U resto_user resto_management < backup_20241205.sql
```

---

## 🌐 Nginx

### Gestión

```bash
sudo systemctl status nginx       # Estado
sudo systemctl start nginx        # Iniciar
sudo systemctl stop nginx         # Detener
sudo systemctl restart nginx      # Reiniciar
sudo systemctl reload nginx       # Recargar config (sin downtime)
```

### Configuración

```bash
sudo nginx -t                     # Probar configuración
sudo nano /etc/nginx/sites-available/resto-backend

# Ver logs
sudo tail -f /var/log/nginx/resto-backend-access.log
sudo tail -f /var/log/nginx/resto-backend-error.log
```

### Fix WebSocket / Socket.IO en producción

Si ves errores `WebSocket connection failed` en el navegador, el problema es que nginx cierra conexiones persistentes por el `proxy_read_timeout` corto (60s) y tiene el header `Connection` hardcodeado.

**Aplicar el fix en el VPS:**

```bash
# 1. Abrir el archivo de configuración activo en el VPS
sudo nano /etc/nginx/sites-available/resto-backend

# 2. Agregar el map FUERA del bloque server (al inicio del archivo):
# map $http_upgrade $connection_upgrade {
#     default upgrade;
#     ''      close;
# }

# 3. Agregar un bloque location específico para Socket.IO ANTES del location /:
# location /socket.io/ {
#     proxy_pass http://localhost:4000;
#     proxy_http_version 1.1;
#     proxy_set_header Upgrade $http_upgrade;
#     proxy_set_header Connection $connection_upgrade;
#     proxy_set_header Host $host;
#     proxy_set_header X-Real-IP $remote_addr;
#     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#     proxy_set_header X-Forwarded-Proto $scheme;
#     proxy_cache_bypass $http_upgrade;
#     proxy_connect_timeout 60s;
#     proxy_send_timeout    3600s;   # <-- clave: sin límite para WS
#     proxy_read_timeout    3600s;   # <-- clave: sin límite para WS
# }

# 4. En el location / existente, cambiar Connection 'upgrade' por $connection_upgrade:
# proxy_set_header Connection $connection_upgrade;

# 5. Verificar y aplicar
sudo nginx -t && sudo systemctl reload nginx
```

O copiar directamente desde el repo (ya incluye todos los cambios):

```bash
# Desde el directorio del repo en el VPS
sudo cp nginx-https.conf /etc/nginx/sites-available/resto-backend
# Editar el server_name y las rutas de certificado SSL
sudo nano /etc/nginx/sites-available/resto-backend
sudo nginx -t && sudo systemctl reload nginx
```

---

## 🔒 SSL / Let's Encrypt

### Obtener Certificado

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
sudo certbot certificates         # Ver certificados instalados
```

### Renovación

```bash
sudo certbot renew                # Renovar manualmente
sudo certbot renew --dry-run      # Probar renovación
systemctl status certbot.timer    # Auto-renovación activa?
```

---

## 🔥 Firewall

### UFW (Ubuntu)

```bash
sudo ufw status                   # Ver estado
sudo ufw enable                   # Activar
sudo ufw disable                  # Desactivar

# Reglas
sudo ufw allow 22/tcp             # SSH
sudo ufw allow 80/tcp             # HTTP
sudo ufw allow 443/tcp            # HTTPS
sudo ufw allow from 192.168.1.0/24  # Red específica

# Ver reglas
sudo ufw status numbered
sudo ufw delete 3                 # Eliminar regla #3
```

---

## 📁 Gestión de Uploads (S3/Spaces únicamente)

### Verificación

```bash
# Verificar que no hay archivos locales (todos están en S3)
ls -la uploads/ 2>/dev/null || echo "✅ No hay directorio uploads/ local (correcto)"

# Los archivos se acceden únicamente a través de la API:
# GET /api/uploads/{key} - Proxy desde Spaces
# POST /api/uploads/image - Upload directo a Spaces
```

### Limpieza (no necesaria - archivos en S3)

```bash
# No hay archivos locales para limpiar
echo "✅ Todos los archivos están en S3 DigitalOcean Spaces"
```

---

## 🔍 Debugging

### Ver errores recientes

```bash
# PM2
pm2 logs resto-backend --err --lines 50

# Docker
docker-compose logs app | grep ERROR

# Nginx
sudo tail -50 /var/log/nginx/resto-backend-error.log
```

### Health Check

```bash
# Local
curl http://localhost:4000/api/health

# Remoto
curl https://yourdomain.com/api/health
```

### Test Database

```bash
# PM2
npx prisma db pull                # Verificar schema

# Docker
docker-compose exec app npx prisma db pull
```

### Port Scanning

```bash
sudo lsof -i :4000                # Qué usa puerto 4000
netstat -tulpn | grep LISTEN      # Todos los puertos abiertos
ss -tulpn                         # Alternativa moderna
```

---

## 🧹 Mantenimiento

### Limpiar logs

```bash
# PM2
pm2 flush
rm -rf ~/.pm2/logs/*

# Docker
docker-compose logs --no-log-prefix > /dev/null

# Nginx
sudo truncate -s 0 /var/log/nginx/resto-backend-*.log
```

### Limpiar node_modules

```bash
rm -rf node_modules package-lock.json
npm install
```

### Rebuild completo

```bash
# PM2
npm ci
npx prisma generate
npm run build
pm2 restart resto-backend

# Docker
docker-compose down -v
docker-compose up -d --build
```

---

## 💾 Backup Automatizado

### Configurar cron

```bash
crontab -e

# Backup diario a las 2 AM
0 2 * * * /var/www/resto-backend/backup.sh

# Backup cada 6 horas
0 */6 * * * /var/www/resto-backend/backup.sh

# Ver cron jobs
crontab -l
```

### Ver backups

```bash
ls -lh /var/backups/resto-management/
```

---

## 📊 Performance

### Ver uso de recursos

```bash
# Top procesos
top
htop

# IO Disk
iotop

# Network
iftop
nethogs
```

### Optimizar PostgreSQL

```bash
# Vacuumear DB
sudo -u postgres vacuumdb --all --analyze

# Ver queries lentas
sudo -u postgres psql resto_management
SELECT * FROM pg_stat_activity WHERE state != 'idle';
```

---

## 🆘 Emergencias

### Servicio caído

```bash
# Verificar qué falló
pm2 status
sudo systemctl status nginx
sudo systemctl status postgresql

# Reiniciar todo
pm2 restart all
sudo systemctl restart nginx
sudo systemctl restart postgresql
```

### Sin espacio en disco

```bash
df -h                             # Ver uso
du -sh /* | sort -rh | head -10   # Top 10 directorios

# Limpiar
sudo apt clean
sudo apt autoremove
docker system prune -a
```

### Memoria agotada

```bash
free -h                           # Ver memoria
pm2 restart resto-backend         # Restart app
sudo systemctl restart postgresql # Restart DB

# Agregar swap (si no existe)
./optimize-oracle.sh
```

---

## 🎯 Generar JWT Secret

```bash
# Opción 1: OpenSSL
openssl rand -base64 32

# Opción 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Opción 3: Online
# https://www.grc.com/passwords.htm
```

---

## 📝 Ver variables de entorno

```bash
# PM2
pm2 env 0                         # Ver env del proceso 0

# Docker
docker-compose exec app env

# Archivo
cat .env
```

---

## ✅ Verificación Post-Despliegue

```bash
# 1. Health check
curl http://localhost:4000/api/health

# 2. Base de datos
sudo -u postgres psql -c "SELECT version();"

# 3. Nginx
sudo nginx -t

# 4. SSL
curl -I https://yourdomain.com

# 5. Uploads (S3/Spaces)
echo "✅ Todos los archivos están en DigitalOcean Spaces - no hay archivos locales"

# 6. PM2
pm2 status

# 7. Firewall
sudo ufw status
```

---

**💡 Tip:** Guarda este archivo en tu VPS como `commands.md` para referencia rápida!
