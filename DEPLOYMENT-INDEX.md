# 📖 Índice de Documentación de Despliegue

## 🎯 ¿Por dónde empezar?

### 🚀 Si quieres desplegar AHORA (Express)

➡️ Lee: **[QUICKSTART-ORACLE.md](./QUICKSTART-ORACLE.md)**

- Guía paso a paso para Oracle Cloud
- 30 minutos de setup
- Gratis permanentemente

### 📚 Si quieres entender TODO antes

➡️ Lee: **[DEPLOYMENT.md](./DEPLOYMENT.md)**

- Guía completa y detallada
- Docker y PM2 explicados
- Todos los proveedores VPS
- Troubleshooting extenso

### ✅ Si quieres un checklist para no olvidar nada

➡️ Usa: **[DEPLOY-CHECKLIST.md](./DEPLOY-CHECKLIST.md)**

- ~120 items verificables
- 10 fases organizadas
- Perfecto para seguir paso a paso

### 🔧 Si ya desplegaste y necesitas comandos

➡️ Consulta: **[USEFUL-COMMANDS.md](./USEFUL-COMMANDS.md)**

- Todos los comandos útiles
- Monitoreo, debugging, mantenimiento
- Copiar y pegar directo

---

## 📂 Todos los Archivos

### 📖 Documentación

| Archivo                                        | Propósito                  | Cuándo Usar                     |
| ---------------------------------------------- | -------------------------- | ------------------------------- |
| [QUICKSTART-ORACLE.md](./QUICKSTART-ORACLE.md) | Guía express Oracle Cloud  | Primera vez, quiero algo rápido |
| [DEPLOYMENT.md](./DEPLOYMENT.md)               | Guía completa              | Quiero entender todo            |
| [DEPLOY-CHECKLIST.md](./DEPLOY-CHECKLIST.md)   | Checklist de 120 items     | Durante el despliegue           |
| [USEFUL-COMMANDS.md](./USEFUL-COMMANDS.md)     | Comandos útiles            | Después del despliegue          |
| [DEPLOYMENT-STATUS.md](./DEPLOYMENT-STATUS.md) | Estado de archivos creados | Ver qué tenemos                 |
| [README-DEPLOYMENT.md](./README-DEPLOYMENT.md) | Resumen de archivos        | Referencia rápida               |

### 🔧 Configuración

| Archivo               | Descripción                                             |
| --------------------- | ------------------------------------------------------- |
| `.env.production`     | Template de variables de entorno (editar antes de usar) |
| `ecosystem.config.js` | Configuración de PM2 para producción                    |
| `nginx.conf`          | Configuración de Nginx reverse proxy                    |

### 🐳 Docker

| Archivo              | Descripción                                  |
| -------------------- | -------------------------------------------- |
| `Dockerfile`         | Multi-stage build optimizado para producción |
| `docker-compose.yml` | Stack completo (NestJS + PostgreSQL)         |
| `.dockerignore`      | Archivos excluidos del build de Docker       |

### 🚀 Scripts

| Archivo              | Propósito                  | Ejecutar Cuándo               |
| -------------------- | -------------------------- | ----------------------------- |
| `quickdeploy.sh`     | Deploy automático completo | Primera vez + actualizaciones |
| `setup-vps.sh`       | Setup inicial de VPS       | Solo primera vez              |
| `deploy.sh`          | Script de actualización    | Cada actualización            |
| `optimize-oracle.sh` | Optimizar para 1GB RAM     | Después de setup en Oracle    |
| `backup.sh`          | Backup de DB y uploads     | Manualmente o cron            |

---

## 🎓 Flujos de Trabajo

### 🆕 Despliegue Inicial (Primera Vez)

#### Opción 1: Oracle Cloud + Quick Deploy (Recomendado)

```
1. QUICKSTART-ORACLE.md (leer)
2. setup-vps.sh (ejecutar)
3. optimize-oracle.sh (ejecutar)
4. .env.production → .env (copiar y editar)
5. quickdeploy.sh (ejecutar)
6. nginx.conf (configurar)
7. DEPLOY-CHECKLIST.md (seguir)
```

#### Opción 2: Docker (Más Fácil)

```
1. DEPLOYMENT.md → Sección Docker (leer)
2. .env.production → .env (copiar y editar)
3. docker-compose up -d (ejecutar)
4. nginx.conf (configurar)
5. Let's Encrypt (configurar SSL)
```

#### Opción 3: PM2 Manual (Más Control)

```
1. DEPLOYMENT.md → Sección PM2 (leer)
2. setup-vps.sh (ejecutar)
3. .env.production → .env (copiar y editar)
4. npm install + build (manual)
5. pm2 start ecosystem.config.js
6. nginx.conf (configurar)
```

### 🔄 Actualización de Código

#### Con PM2

```bash
cd /var/www/resto-backend
./deploy.sh
```

#### Con Docker

```bash
cd /var/www/resto-management-backend
git pull
docker-compose up -d --build
docker-compose exec app npx prisma migrate deploy
```

### 🐛 Debugging

```
1. USEFUL-COMMANDS.md → Sección Debugging
2. Ver logs (pm2 logs o docker-compose logs)
3. DEPLOYMENT.md → Troubleshooting
4. Verificar health check
```

---

## 💡 Consejos por Escenario

### "Nunca desplegué nada"

1. Lee QUICKSTART-ORACLE.md primero
2. Abre Oracle Cloud, crea cuenta
3. Sigue el checklist paso a paso
4. No te saltes pasos

### "Ya tengo experiencia con servers"

1. Revisa ecosystem.config.js y nginx.conf
2. Ajusta a tu preferencia
3. Ejecuta setup-vps.sh para ahorrar tiempo
4. Personaliza según necesites

### "Quiero Docker porque es más fácil"

1. Lee DEPLOYMENT.md sección Docker
2. docker-compose up -d
3. Listo en 15 minutos

### "Tengo memoria limitada (1GB RAM)"

1. Ejecuta optimize-oracle.sh
2. Verifica swap: swapon --show
3. Monitorea: free -h y pm2 monit

### "Algo salió mal"

1. USEFUL-COMMANDS.md → Emergencias
2. pm2 logs o docker-compose logs
3. DEPLOYMENT.md → Troubleshooting
4. Reinicia servicios uno por uno

---

## 📊 Matriz de Decisión

### ¿Qué método de despliegue usar?

| Criterio            | Docker     | PM2        |
| ------------------- | ---------- | ---------- |
| **Facilidad**       | ⭐⭐⭐⭐⭐ | ⭐⭐⭐     |
| **Velocidad Setup** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐     |
| **Uso de Memoria**  | ⭐⭐⭐     | ⭐⭐⭐⭐⭐ |
| **Control**         | ⭐⭐⭐     | ⭐⭐⭐⭐⭐ |
| **Portabilidad**    | ⭐⭐⭐⭐⭐ | ⭐⭐⭐     |
| **Debug**           | ⭐⭐⭐     | ⭐⭐⭐⭐   |

**Recomendación:**

- 🆕 Primera vez / Principiante → **Docker**
- 💪 Experiencia / VPS limitada → **PM2**
- 🚀 Máxima velocidad → **quickdeploy.sh**

---

## 🔗 Links Externos Útiles

### Proveedores VPS

- [Oracle Cloud Always Free](https://www.oracle.com/cloud/free/)
- [DigitalOcean](https://www.digitalocean.com/)
- [Vultr](https://www.vultr.com/)
- [Hetzner](https://www.hetzner.com/cloud)

### Herramientas

- [Let's Encrypt](https://letsencrypt.org/)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Docker Documentation](https://docs.docker.com/)
- [Nginx Documentation](https://nginx.org/en/docs/)

### DNS & Dominios

- [Namecheap](https://www.namecheap.com/)
- [Google Domains](https://domains.google/)
- [Cloudflare DNS](https://www.cloudflare.com/dns/)

---

## 📞 Soporte

Si encuentras problemas:

1. **Revisa los logs:**

   ```bash
   pm2 logs --lines 100
   # o
   docker-compose logs -f
   ```

2. **Consulta Troubleshooting:**
   - DEPLOYMENT.md → Sección Troubleshooting
   - USEFUL-COMMANDS.md → Sección Debugging

3. **Verifica checklist:**
   - DEPLOY-CHECKLIST.md
   - Marca los items completados

4. **Health checks:**
   ```bash
   curl http://localhost:4000/api/health
   curl https://yourdomain.com/api/health
   ```

---

## ✅ Resumen

**Tienes TODO lo necesario para:**

- ✅ Desplegar en Oracle Cloud (gratis)
- ✅ Desplegar en cualquier VPS
- ✅ Usar Docker o PM2
- ✅ Configurar SSL/HTTPS
- ✅ Optimizar para 1GB RAM
- ✅ Hacer backups automáticos
- ✅ Monitorear y debuggear
- ✅ Actualizar código fácilmente

**Archivos creados:** 15+ archivos
**Scripts automatizados:** 5 scripts
**Documentación:** 6 guías completas
**Tiempo estimado:** 30-60 minutos

---

**🚀 Siguiente paso:** Abre [QUICKSTART-ORACLE.md](./QUICKSTART-ORACLE.md) y comienza!
