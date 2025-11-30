# 🚀 Guía de Inicio Rápido - PostgreSQL + Backend

## 📋 Problema Actual

El backend no puede conectarse a PostgreSQL porque el servicio no está ejecutándose.

```
Error: ECONNREFUSED
```

---

## ✅ Solución: Iniciar PostgreSQL

### Opción 1: Docker (Recomendado - Más Rápido)

Si tienes Docker instalado, ejecuta:

```bash
# Crear y ejecutar PostgreSQL en Docker
docker run --name resto-postgres \
  -e POSTGRES_PASSWORD=255655 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=resto_db \
  -p 5432:5432 \
  -d postgres:16-alpine

# Verificar que esté corriendo
docker ps

# Ver logs si hay problemas
docker logs resto-postgres
```

**Para detener:**

```bash
docker stop resto-postgres
```

**Para iniciar nuevamente:**

```bash
docker start resto-postgres
```

**Para eliminar (cuidado, borra todos los datos):**

```bash
docker rm -f resto-postgres
```

---

### Opción 2: Servicio de Windows

Si ya tienes PostgreSQL instalado en Windows:

#### A. Desde Servicios de Windows

1. Presiona `Win + R`
2. Escribe `services.msc` y presiona Enter
3. Busca "postgresql-x64-16" (o la versión que tengas)
4. Haz clic derecho → "Iniciar"

#### B. Desde PowerShell (como Administrador)

```powershell
# Listar servicios de PostgreSQL
Get-Service -Name "postgresql*"

# Iniciar el servicio (reemplaza con el nombre exacto)
Start-Service postgresql-x64-16

# Verificar estado
Get-Service postgresql-x64-16
```

#### C. Desde CMD (como Administrador)

```cmd
net start postgresql-x64-16
```

---

### Opción 3: Instalar PostgreSQL

Si NO tienes PostgreSQL instalado:

#### Instalador Oficial (Windows)

1. Descargar: https://www.postgresql.org/download/windows/
2. Ejecutar instalador
3. Durante instalación:
   - Usuario: `postgres`
   - Contraseña: `255655`
   - Puerto: `5432`
4. Completar instalación

#### Con Chocolatey

```bash
choco install postgresql16
```

#### Con Scoop

```bash
scoop install postgresql
```

---

## 🔧 Después de Iniciar PostgreSQL

### 1. Verificar Conexión

```bash
# Desde el proyecto, ejecuta:
npx prisma db pull

# Si conecta correctamente, verás:
# ✔ Introspected 1 models and wrote them into prisma\schema.prisma in XXXms
```

### 2. Aplicar Migraciones Pendientes

```bash
# Aplicar la nueva migración de áreas de mesas
npx prisma migrate dev --name add_table_areas_and_improvements

# O aplicar todas las migraciones (producción)
npx prisma migrate deploy
```

### 3. Generar Cliente de Prisma

```bash
npx prisma generate
```

### 4. (Opcional) Ver Base de Datos

```bash
# Abrir Prisma Studio
npx prisma studio

# Se abrirá en http://localhost:5555
```

### 5. Iniciar el Backend

```bash
# Modo desarrollo
npm run start:dev

# Modo producción
npm run build
npm run start:prod
```

---

## 📊 Verificar que Todo Funciona

### Test de Endpoints

```bash
# 1. Health check (sin auth)
curl http://localhost:3000

# 2. Registrar usuario
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "password123",
    "name": "Admin Test",
    "restaurantName": "Mi Restaurante",
    "restaurantType": "Casual Dining"
  }'

# Guardar el token que retorna en la respuesta

# 3. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "password123"
  }'

# 4. Verificar autenticación
TOKEN="tu_token_aqui"

curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🐳 Docker Compose (Alternativa Todo-en-Uno)

Si prefieres tener todo en Docker, crea este archivo:

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: resto-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: 255655
      POSTGRES_DB: resto_db
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

**Ejecutar:**

```bash
# Iniciar
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener
docker-compose down

# Detener y borrar datos
docker-compose down -v
```

---

## ❌ Solución de Problemas

### Error: "password authentication failed"

Tu contraseña en `.env` no coincide con PostgreSQL.

**Solución:**

1. Abre `.env`
2. Verifica que `DATABASE_URL` tenga la contraseña correcta:
   ```
   DATABASE_URL="postgresql://postgres:255655@localhost:5432/resto_db"
   ```

### Error: "database resto_db does not exist"

La base de datos no está creada.

**Solución con Docker:**

```bash
docker exec -it resto-postgres psql -U postgres -c "CREATE DATABASE resto_db;"
```

**Solución con psql local:**

```bash
psql -U postgres -c "CREATE DATABASE resto_db;"
```

**O dejar que Prisma la cree:**

```bash
npx prisma migrate dev
```

### Error: "port 5432 is already in use"

Otro proceso está usando el puerto.

**Solución:**

```bash
# Ver qué está usando el puerto
netstat -ano | findstr :5432

# Detener proceso (reemplaza PID)
taskkill /PID <número_de_proceso> /F

# O cambiar puerto en Docker
docker run -p 5433:5432 ...
# Y actualizar .env a localhost:5433
```

---

## ✅ Checklist Final

Antes de continuar, verifica que:

- [ ] PostgreSQL está corriendo (Docker o servicio)
- [ ] Puerto 5432 está disponible
- [ ] `.env` tiene credenciales correctas
- [ ] `npx prisma db pull` conecta exitosamente
- [ ] Migraciones aplicadas sin errores
- [ ] `npm run start:dev` inicia el servidor
- [ ] Puedes hacer login en http://localhost:3000/api/auth/login

---

**Una vez que PostgreSQL esté corriendo**, podremos continuar con la implementación de las mejoras de gestión de mesas.

¿Con cuál opción quieres proceder?
