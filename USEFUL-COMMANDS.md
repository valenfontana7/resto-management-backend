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
docker-compose exec app npx prisma db seed
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

### Seed

```bash
npm run prisma:seed               # Cargar datos de prueba

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

## 📁 Gestión de Uploads

### Limpiar uploads viejos

```bash
# Archivos > 30 días
find uploads/ -type f -mtime +30 -delete

# Archivos > 100MB
find uploads/ -type f -size +100M -delete
```

### Ver tamaño

```bash
du -sh uploads/                   # Total
du -sh uploads/dishes/            # Por categoría
find uploads/ -type f | wc -l     # Cantidad de archivos
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

# 5. Uploads
ls -la uploads/dishes/

# 6. PM2
pm2 status

# 7. Firewall
sudo ufw status
```

---

**💡 Tip:** Guarda este archivo en tu VPS como `commands.md` para referencia rápida!
