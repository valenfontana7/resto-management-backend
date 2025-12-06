# Resto Management Backend - Deployment Files

Este directorio contiene los archivos de despliegue para producción.

## 📂 Archivos Creados

### Configuración

- ✅ `.env.production` - Variables de entorno para producción
- ✅ `ecosystem.config.js` - Configuración de PM2
- ✅ `nginx.conf` - Configuración de Nginx (reverse proxy)

### Docker

- ✅ `Dockerfile` - Multi-stage build optimizado
- ✅ `docker-compose.yml` - Stack completo (app + PostgreSQL)
- ✅ `.dockerignore` - Archivos excluidos del build

### Scripts

- ✅ `deploy.sh` - Script de actualización/despliegue
- ✅ `setup-vps.sh` - Setup inicial de VPS

### Documentación

- ✅ `DEPLOYMENT.md` - Guía completa de despliegue

## 🚀 Quick Start

### Opción 1: Docker (Recomendado)

```bash
# 1. Configurar .env
cp .env.production .env
nano .env  # Editar valores

# 2. Iniciar
docker-compose up -d

# 3. Migraciones
docker-compose exec app npx prisma migrate deploy
```

### Opción 2: PM2

```bash
# 1. Setup VPS
./setup-vps.sh

# 2. Deploy
./deploy.sh
```

## 📖 Más Información

Lee la guía completa en [DEPLOYMENT.md](./DEPLOYMENT.md)
