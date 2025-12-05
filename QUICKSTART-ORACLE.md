# 🎯 Guía Rápida de Despliegue en Oracle Cloud

## ⚡ Setup Express (30 minutos)

### 1️⃣ Crear instancia Oracle Cloud
1. Ir a https://www.oracle.com/cloud/free/
2. Crear cuenta gratuita
3. Crear VM:
   - Shape: VM.Standard.E2.1.Micro (Always Free)
   - OS: Ubuntu 22.04
   - RAM: 1GB
   - Storage: 50GB

### 2️⃣ Configurar SSH
```bash
# En tu computadora local
ssh-keygen -t rsa -b 4096 -C "tu@email.com"

# Copiar la clave pública al crear la VM
cat ~/.ssh/id_rsa.pub
```

### 3️⃣ Conectarse y configurar
```bash
# Conectarse a la VPS
ssh ubuntu@TU_IP_PUBLICA

# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Clonar repositorio
git clone https://github.com/tu-usuario/resto-management-backend.git
cd resto-management-backend

# Hacer ejecutables los scripts
chmod +x *.sh

# Setup completo automático
./setup-vps.sh

# Optimizar para Oracle Cloud (1GB RAM)
./optimize-oracle.sh
```

### 4️⃣ Configurar aplicación
```bash
# Copiar y editar .env
cp .env.production .env
nano .env
```

**Editar estos valores:**
```env
DATABASE_URL="postgresql://resto_user:TU_PASSWORD_SEGURO@localhost:5432/resto_management?schema=public"
JWT_SECRET="GENERAR_STRING_ALEATORIO_32_CARACTERES"
FRONTEND_URL="https://tu-dominio.com"
```

### 5️⃣ Desplegar
```bash
# Deployment automático
./quickdeploy.sh

# O manualmente:
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 start ecosystem.config.js --env production
pm2 save
```

### 6️⃣ Configurar Nginx
```bash
# Copiar configuración
sudo cp nginx.conf /etc/nginx/sites-available/resto-backend
sudo ln -s /etc/nginx/sites-available/resto-backend /etc/nginx/sites-enabled/

# Editar dominio
sudo nano /etc/nginx/sites-available/resto-backend
# Cambiar "tu-dominio.com" por tu dominio real

# Reiniciar Nginx
sudo nginx -t
sudo systemctl restart nginx
```

### 7️⃣ SSL con Let's Encrypt
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com
```

### 8️⃣ Configurar Firewall Oracle Cloud

**En Oracle Cloud Console:**
1. Ir a Networking → Virtual Cloud Networks
2. Click en tu VCN → Security Lists
3. Agregar Ingress Rules:
   - Port 80 (HTTP)
   - Port 443 (HTTPS)
   - Port 22 (SSH)

**En la VPS:**
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## ✅ Verificación

```bash
# Ver status
pm2 status
pm2 logs

# Health check
curl http://localhost:4000/api/health

# Desde el exterior
curl https://tu-dominio.com/api/health
```

---

## 🔄 Actualizar después

```bash
cd /path/to/resto-management-backend
./deploy.sh
```

---

## 📊 Monitoreo

```bash
# Ver recursos
htop
free -h
df -h

# Ver logs
pm2 logs resto-backend
pm2 monit

# Nginx logs
sudo tail -f /var/log/nginx/resto-backend-error.log
```

---

## 💾 Backups

```bash
# Backup manual
./backup.sh

# Configurar backup automático diario
crontab -e

# Agregar:
0 2 * * * /var/www/resto-backend/backup.sh
```

---

## 🆘 Troubleshooting

### Error de memoria
```bash
# Ver uso
free -h

# Reiniciar app
pm2 restart resto-backend

# Ver logs
pm2 logs resto-backend --lines 100
```

### Base de datos no conecta
```bash
sudo systemctl status postgresql
sudo -u postgres psql -c "SELECT version();"
```

### 502 Bad Gateway
```bash
# Verificar que la app esté corriendo
pm2 status

# Verificar puerto
netstat -tlnp | grep 4000

# Reiniciar servicios
pm2 restart resto-backend
sudo systemctl restart nginx
```

---

## 💰 Costos

**Oracle Cloud Always Free:**
- ✅ 2 VMs gratis permanentemente
- ✅ 200GB storage total
- ✅ 10TB bandwidth/mes
- ✅ **COSTO: $0/mes**

**Alternativa DigitalOcean:**
- 1GB RAM, 1 CPU, 25GB SSD
- **COSTO: $6/mes** (primer mes gratis con código)

---

## 🔗 Links Útiles

- Oracle Cloud: https://www.oracle.com/cloud/free/
- Documentación Prisma: https://www.prisma.io/docs
- PM2 Docs: https://pm2.keymetrics.io/
- Certbot: https://certbot.eff.org/

---

## 📝 Checklist

- [ ] VM creada en Oracle Cloud
- [ ] SSH configurado
- [ ] Scripts ejecutados (setup-vps.sh, optimize-oracle.sh)
- [ ] .env configurado
- [ ] App desplegada con PM2
- [ ] Nginx configurado
- [ ] SSL activado
- [ ] Firewall configurado (Oracle + UFW)
- [ ] Health check funcionando
- [ ] Backups configurados

¡Listo! Tu backend está en producción 🚀
