# ✅ Checklist de Despliegue - Resto Management Backend

## 🎯 Pre-requisitos

### Cuenta y Servidor
- [ ] Cuenta creada en Oracle Cloud (o proveedor alternativo)
- [ ] VM/VPS creada (Ubuntu 22.04 recomendado)
- [ ] IP pública asignada
- [ ] SSH key configurado localmente
- [ ] Puedes conectarte: `ssh ubuntu@YOUR_IP`

### Dominio (Opcional pero recomendado)
- [ ] Dominio registrado (ej: Namecheap, Google Domains)
- [ ] DNS A Record configurado: `yourdomain.com → YOUR_VPS_IP`
- [ ] DNS A Record configurado: `www.yourdomain.com → YOUR_VPS_IP`
- [ ] Esperado 5-60 min para propagación DNS

---

## 📦 Fase 1: Setup Inicial del Servidor

### En tu VPS (vía SSH)
- [ ] Conectado exitosamente: `ssh ubuntu@YOUR_IP`
- [ ] Sistema actualizado: `sudo apt update && sudo apt upgrade -y`
- [ ] Repositorio clonado en `/var/www/resto-management-backend`
- [ ] Scripts tienen permisos: `chmod +x *.sh`

### Opción A: Setup Automático
- [ ] Ejecutado: `./setup-vps.sh`
- [ ] Node.js 20 instalado: `node --version`
- [ ] PostgreSQL instalado: `psql --version`
- [ ] PM2 instalado: `pm2 --version`
- [ ] Nginx instalado: `nginx -v`

### Opción B: Docker
- [ ] Docker instalado: `docker --version`
- [ ] Docker Compose instalado: `docker-compose --version`
- [ ] Usuario agregado al grupo docker: `groups $USER | grep docker`

---

## ⚙️ Fase 2: Configuración

### Variables de Entorno
- [ ] Copiado `.env.production` a `.env`: `cp .env.production .env`
- [ ] Editado `.env`: `nano .env`
- [ ] `DATABASE_URL` configurada correctamente
- [ ] `JWT_SECRET` generado (min 32 caracteres): `openssl rand -base64 32`
- [ ] `FRONTEND_URL` configurada (tu dominio o IP)
- [ ] `NODE_ENV=production` establecido
- [ ] `PORT=4000` configurado

### PostgreSQL
- [ ] Base de datos creada: `resto_management`
- [ ] Usuario creado: `resto_user`
- [ ] Password cambiado del default
- [ ] Conexión probada: `psql -U resto_user -d resto_management`

---

## 🚀 Fase 3: Despliegue de la Aplicación

### Opción A: PM2 (Quick Deploy)
- [ ] Ejecutado: `./quickdeploy.sh`
- [ ] Dependencias instaladas: `node_modules/` existe
- [ ] Prisma Client generado
- [ ] Migraciones aplicadas exitosamente
- [ ] Build completado: `dist/` existe
- [ ] PM2 corriendo: `pm2 status` muestra "online"
- [ ] PM2 guardado: `pm2 save`
- [ ] Auto-start configurado: `pm2 startup`

### Opción B: Docker
- [ ] `.env` configurado con valores correctos
- [ ] Ejecutado: `docker-compose up -d`
- [ ] Contenedores corriendo: `docker-compose ps`
- [ ] Migraciones aplicadas: `docker-compose exec app npx prisma migrate deploy`
- [ ] Health check pasa: `docker-compose exec app curl localhost:4000/api/health`

### Verificación Local
- [ ] App responde: `curl http://localhost:4000/api/health`
- [ ] Respuesta JSON con `status: "ok"`

---

## 🌐 Fase 4: Nginx & Reverse Proxy

### Configuración Nginx
- [ ] Archivo copiado: `sudo cp nginx.conf /etc/nginx/sites-available/resto-backend`
- [ ] Symlink creado: `sudo ln -s /etc/nginx/sites-available/resto-backend /etc/nginx/sites-enabled/`
- [ ] Editado dominio en config: `sudo nano /etc/nginx/sites-available/resto-backend`
- [ ] Configuración válida: `sudo nginx -t`
- [ ] Nginx reiniciado: `sudo systemctl restart nginx`

### Verificación Externa
- [ ] HTTP funciona: `curl http://yourdomain.com/api/health`
- [ ] O con IP: `curl http://YOUR_IP/api/health`

---

## 🔒 Fase 5: SSL/HTTPS (Let's Encrypt)

### Instalación Certbot
- [ ] Certbot instalado: `sudo apt install -y certbot python3-certbot-nginx`
- [ ] Dominio apunta a tu IP (verifica DNS)

### Obtener Certificado
- [ ] Ejecutado: `sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com`
- [ ] Email configurado para renovaciones
- [ ] Términos aceptados
- [ ] Certificado obtenido exitosamente
- [ ] Nginx recargado automáticamente

### Verificación HTTPS
- [ ] HTTPS funciona: `curl https://yourdomain.com/api/health`
- [ ] HTTP redirige a HTTPS automáticamente
- [ ] Candado verde en navegador
- [ ] Certificado válido (no expired)

### Auto-renovación
- [ ] Timer activo: `systemctl status certbot.timer`
- [ ] Prueba de renovación: `sudo certbot renew --dry-run`

---

## 🔥 Fase 6: Firewall & Seguridad

### Firewall VPS
- [ ] UFW activado: `sudo ufw enable`
- [ ] SSH permitido: `sudo ufw allow 22/tcp`
- [ ] HTTP permitido: `sudo ufw allow 80/tcp`
- [ ] HTTPS permitido: `sudo ufw allow 443/tcp`
- [ ] Estado verificado: `sudo ufw status`

### Firewall Oracle Cloud (si aplica)
En Oracle Cloud Console:
- [ ] VCN → Security Lists → Default Security List
- [ ] Ingress Rule: Puerto 80 (HTTP) - Source: 0.0.0.0/0
- [ ] Ingress Rule: Puerto 443 (HTTPS) - Source: 0.0.0.0/0
- [ ] Ingress Rule: Puerto 22 (SSH) - Source: Tu IP o 0.0.0.0/0

### Fail2Ban
- [ ] Instalado: `sudo apt install -y fail2ban`
- [ ] Habilitado: `sudo systemctl enable fail2ban`
- [ ] Corriendo: `sudo systemctl status fail2ban`

---

## 🔧 Fase 7: Optimizaciones

### Oracle Cloud (1GB RAM)
- [ ] Script ejecutado: `./optimize-oracle.sh`
- [ ] Swap 2GB creado: `swapon --show`
- [ ] Swappiness ajustado: `cat /proc/sys/vm/swappiness` (debe ser 10)
- [ ] PostgreSQL optimizado (ver script)

### Verificar Recursos
- [ ] Memoria disponible: `free -h` (swap activo)
- [ ] Disco disponible: `df -h` (min 20% libre)
- [ ] PM2 límite memoria: Ver `ecosystem.config.js` (500MB)

---

## 💾 Fase 8: Backups

### Configuración Backup
- [ ] Script backup revisado: `cat backup.sh`
- [ ] Password PostgreSQL en script o variable
- [ ] Directorio backup existe: `mkdir -p /var/backups/resto-management`

### Cron Job
- [ ] Crontab editado: `crontab -e`
- [ ] Línea agregada: `0 2 * * * /var/www/resto-backend/backup.sh`
- [ ] Crontab guardado
- [ ] Cron verificado: `crontab -l`

### Probar Backup Manual
- [ ] Ejecutado: `./backup.sh`
- [ ] Archivos creados en `/var/backups/resto-management/`
- [ ] SQL dump existe
- [ ] Uploads tar.gz existe

---

## 📊 Fase 9: Monitoreo

### PM2 (si aplica)
- [ ] PM2 Plus configurado (opcional)
- [ ] Logs funcionando: `pm2 logs`
- [ ] Monit funcionando: `pm2 monit`

### Health Checks
- [ ] Endpoint `/health` responde
- [ ] Endpoint `/api/health` responde
- [ ] Docker healthcheck pasa (si aplica)

### Herramientas Instaladas
- [ ] htop instalado: `htop`
- [ ] iotop instalado: `sudo iotop`

---

## ✅ Fase 10: Verificación Final

### Funcionalidad
- [ ] Health check: `curl https://yourdomain.com/api/health`
- [ ] Swagger docs (si aplica): `https://yourdomain.com/api/docs`
- [ ] Registro de usuario funciona
- [ ] Login funciona
- [ ] JWT tokens generados correctamente
- [ ] Endpoints protegidos requieren auth
- [ ] Uploads de imágenes funcionan
- [ ] Database queries funcionan

### Rendimiento
- [ ] Tiempo de respuesta < 500ms
- [ ] Sin memory leaks (monitorear 24h)
- [ ] CPU uso < 50% en idle
- [ ] RAM uso < 70%

### Logs
- [ ] PM2 logs sin errores: `pm2 logs --lines 50`
- [ ] Nginx access log: `sudo tail -f /var/log/nginx/resto-backend-access.log`
- [ ] Nginx error log vacío: `sudo tail /var/log/nginx/resto-backend-error.log`
- [ ] PostgreSQL log sin errores

---

## 🎉 Post-Despliegue

### Documentación
- [ ] URLs actualizadas en frontend
- [ ] Equipo informado de nueva URL
- [ ] Credenciales admin guardadas seguras
- [ ] Variables de entorno documentadas

### Testing
- [ ] Frontend conectado al backend
- [ ] Flujo completo: registro → login → crear plato → ver menú
- [ ] Webhooks configurados (MercadoPago si aplica)
- [ ] Emails funcionando (si aplica)

### Mantenimiento
- [ ] Calendario de backups revisado
- [ ] Alertas configuradas (opcional)
- [ ] Proceso de actualización documentado
- [ ] Runbook de emergencias creado

---

## 📝 Información para Guardar

```
🌐 Producción
URL: https://yourdomain.com
API Health: https://yourdomain.com/api/health
IP VPS: YOUR_VPS_IP

🔐 Accesos
SSH: ssh ubuntu@YOUR_VPS_IP
DB: postgresql://resto_user:PASSWORD@localhost:5432/resto_management

📁 Ubicaciones
App: /var/www/resto-backend
Logs PM2: ~/.pm2/logs/
Logs Nginx: /var/log/nginx/
Backups: /var/backups/resto-management/

🔑 Comandos Útiles
Status: pm2 status
Logs: pm2 logs resto-backend
Restart: pm2 restart resto-backend
Update: cd /var/www/resto-backend && ./deploy.sh
```

---

## 🆘 Si algo falla...

1. **Ver logs detallados:**
   ```bash
   pm2 logs resto-backend --lines 100
   sudo tail -100 /var/log/nginx/resto-backend-error.log
   ```

2. **Reiniciar servicios:**
   ```bash
   pm2 restart resto-backend
   sudo systemctl restart nginx
   sudo systemctl restart postgresql
   ```

3. **Verificar recursos:**
   ```bash
   free -h
   df -h
   htop
   ```

4. **Consultar documentación:**
   - [DEPLOYMENT.md](./DEPLOYMENT.md)
   - [USEFUL-COMMANDS.md](./USEFUL-COMMANDS.md)
   - [TROUBLESHOOTING sección en DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting)

---

**✅ Total Items:** ~120 checks
**⏱️ Tiempo Estimado:** 30-60 minutos (primera vez)
**🎯 Resultado:** Backend en producción, seguro y optimizado

¡Suerte con el despliegue! 🚀
