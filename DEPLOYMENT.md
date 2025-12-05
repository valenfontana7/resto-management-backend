# 🚀 Guía de Despliegue - Resto Management Backend

## 📋 Requisitos

### VPS Recomendadas (Gratis o Económicas)
- **Oracle Cloud Always Free Tier** ⭐ Recomendado
  - VM.Standard.E2.1.Micro: 1 OCPU, 1GB RAM
  - 2 VMs gratis permanentemente
  - 200GB block storage
  - https://www.oracle.com/cloud/free/

- **Alternativas**
  - Google Cloud Free Tier (90 días)
  - AWS Free Tier (12 meses)
  - DigitalOcean ($4-5/mes)
  - Vultr ($2.50-5/mes)
  - Hetzner Cloud (€3.79/mes)

### Especificaciones Mínimas
- CPU: 1 core
- RAM: 1GB (2GB recomendado)
- Storage: 20GB
- OS: Ubuntu 22.04 LTS o Debian 12

---

## 🎯 Opción 1: Despliegue con Docker (Recomendado)

### 1. Preparar VPS
```bash
# Conectarse a la VPS
ssh usuario@tu-vps-ip

# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker y Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt install -y docker-compose

# Agregar usuario al grupo docker
sudo usermod -aG docker $USER

# Instalar Git
sudo apt install -y git

# Recargar sesión
newgrp docker
```

### 2. Clonar Repositorio
```bash
# Crear directorio
sudo mkdir -p /var/www
cd /var/www

# Clonar repositorio
git clone https://github.com/tu-usuario/resto-management-backend.git
cd resto-management-backend
```

### 3. Configurar Variables de Entorno
```bash
# Crear archivo .env
nano .env
```

Agregar:
```env
# PostgreSQL
POSTGRES_PASSWORD=tu_password_super_seguro_aqui

# JWT
JWT_SECRET=cambiar_por_un_secret_muy_seguro_de_al_menos_32_caracteres_random

# Frontend URL
FRONTEND_URL=https://tu-dominio.com
```

### 4. Desplegar
```bash
# Levantar servicios
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Aplicar migraciones
docker-compose exec app npx prisma migrate deploy

# (Opcional) Seed inicial
docker-compose exec app npx prisma db seed
```

### 5. Verificar
```bash
# Ver estado de contenedores
docker-compose ps

# Verificar API
curl http://localhost:4000/api/health
```

---

## 🎯 Opción 2: Despliegue con PM2 (Sin Docker)

### 1. Setup Inicial de VPS
```bash
# Conectarse a la VPS
ssh usuario@tu-vps-ip

# Ejecutar script de setup
curl -o setup-vps.sh https://raw.githubusercontent.com/tu-usuario/resto-management-backend/master/setup-vps.sh
chmod +x setup-vps.sh
./setup-vps.sh
```

### 2. Configurar Base de Datos
```bash
# Cambiar contraseña de PostgreSQL
sudo -u postgres psql
ALTER USER resto_user WITH PASSWORD 'tu_password_seguro';
\q
```

### 3. Desplegar Aplicación
```bash
# Ir al directorio de la app
cd /var/www/resto-backend

# Clonar repositorio
git clone https://github.com/tu-usuario/resto-management-backend.git .

# Configurar .env
cp .env.production .env
nano .env  # Editar con tus valores

# Instalar dependencias
npm ci

# Generar Prisma Client
npx prisma generate

# Aplicar migraciones
npx prisma migrate deploy

# (Opcional) Seed
npm run seed

# Build
npm run build

# Iniciar con PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### 4. Configurar Nginx
```bash
# Copiar configuración
sudo cp nginx.conf /etc/nginx/sites-available/resto-backend

# Crear symlink
sudo ln -s /etc/nginx/sites-available/resto-backend /etc/nginx/sites-enabled/

# Editar dominio
sudo nano /etc/nginx/sites-available/resto-backend
# Cambiar "tu-dominio.com" por tu dominio real

# Probar configuración
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

### 5. SSL con Let's Encrypt
```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtener certificado
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com

# El certificado se renovará automáticamente
```

---

## 🔄 Actualizaciones

### Con Docker
```bash
cd /var/www/resto-management-backend
git pull origin master
docker-compose down
docker-compose up -d --build
docker-compose exec app npx prisma migrate deploy
```

### Con PM2
```bash
cd /var/www/resto-backend
./deploy.sh
```

---

## 📊 Monitoreo

### Ver Logs
```bash
# Docker
docker-compose logs -f app

# PM2
pm2 logs resto-backend
pm2 monit
```

### Estado de Servicios
```bash
# Docker
docker-compose ps

# PM2
pm2 status

# Nginx
sudo systemctl status nginx

# PostgreSQL
sudo systemctl status postgresql
```

---

## 🔒 Seguridad

### 1. Firewall
```bash
# Permitir solo puertos necesarios
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 2. SSH Seguro
```bash
# Desactivar login con contraseña (usar solo SSH keys)
sudo nano /etc/ssh/sshd_config
# Cambiar: PasswordAuthentication no
sudo systemctl restart sshd
```

### 3. Fail2Ban
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## 🐛 Troubleshooting

### Error de conexión a base de datos
```bash
# Verificar PostgreSQL
sudo systemctl status postgresql

# Ver logs
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

### Aplicación no inicia
```bash
# Docker
docker-compose logs app

# PM2
pm2 logs resto-backend --lines 100
```

### Problemas de memoria
```bash
# Ver uso de memoria
free -h
docker stats  # Si usas Docker

# Ajustar PM2 max_memory_restart en ecosystem.config.js
```

### Uploads no funcionan
```bash
# Verificar permisos
ls -la uploads/
chmod -R 755 uploads/
chown -R $USER:$USER uploads/  # PM2
# o
chown -R 1001:1001 uploads/    # Docker
```

---

## 💰 Costos Estimados

| Proveedor | Plan | CPU | RAM | Storage | Costo/Mes |
|-----------|------|-----|-----|---------|-----------|
| Oracle Cloud | Always Free | 1 OCPU | 1GB | 50GB | **$0** |
| DigitalOcean | Basic | 1 CPU | 1GB | 25GB | $6 |
| Vultr | Cloud Compute | 1 CPU | 1GB | 25GB | $6 |
| Hetzner | CX11 | 1 CPU | 2GB | 20GB | €4.51 |
| AWS Lightsail | Nano | 0.5 CPU | 512MB | 20GB | $3.50 |

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs: `docker-compose logs` o `pm2 logs`
2. Verifica la configuración de .env
3. Asegúrate de que las migraciones se aplicaron correctamente
4. Verifica que los puertos no estén bloqueados

---

## ✅ Checklist de Despliegue

- [ ] VPS configurada con Ubuntu/Debian
- [ ] Docker instalado (Opción 1) o Node.js + PM2 + PostgreSQL (Opción 2)
- [ ] Repositorio clonado
- [ ] Archivo .env configurado con valores de producción
- [ ] JWT_SECRET seguro generado
- [ ] Base de datos creada
- [ ] Migraciones aplicadas
- [ ] Aplicación construida y corriendo
- [ ] Nginx configurado como reverse proxy
- [ ] SSL configurado con Let's Encrypt
- [ ] Firewall configurado
- [ ] Backups configurados
- [ ] Monitoreo activo

¡Buena suerte con el despliegue! 🚀
