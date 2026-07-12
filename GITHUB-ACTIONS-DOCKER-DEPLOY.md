# GitHub Actions Docker Deploy

This project can publish its production Docker image automatically with GitHub Actions.

## Workflow

The workflow lives at `.github/workflows/docker-publish.yml`.

It runs on:

- pushes to `main`
- pushes to `master`
- manual runs from the GitHub Actions tab

It publishes the image:

- `valenfontana7/resto-management-backend:latest` on the default branch
- `valenfontana7/resto-management-backend:sha-<commit>`
- `valenfontana7/resto-management-backend:<branch>`

## Required GitHub secrets

Configure these repository secrets in GitHub:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
- `DATABASE_URL` optional, only needed if you want a real build-time value for Prisma generate

If `DATABASE_URL` is not set, the workflow uses a safe placeholder value.

## Auto deploy to VPS (after Docker build)

The same workflow can deploy to your VPS automatically after the image is pushed.

Enable it in the GitHub repo:

1. **Repository variable** (Settings → Secrets and variables → Actions → Variables):
   - `VPS_DEPLOY_ENABLED` = `true`
   - `VPS_APP_PATH` = `/var/www/resto-management-backend` (optional; this is the default)

2. **Secrets** — el job usa `environment: production`, así que conviene cargarlos ahí:
   - Repo → Settings → Environments → **production** → Environment secrets
   - (También funcionan a nivel repo si no hay override en el environment)

   Secrets requeridos:
   - `VPS_HOST` — IP o hostname del VPS
   - `VPS_USER` — usuario SSH (ej. `ubuntu`, `deploy`)
   - `VPS_SSH_KEY` — **clave privada completa**, incluyendo las líneas `BEGIN`/`END`

3. **Formato de `VPS_SSH_KEY`** (causa más común del error `ssh: no key found`):

   Generá un par dedicado para deploy:

   ```bash
   ssh-keygen -t ed25519 -C "github-actions-bentoo-deploy" -f bentoo_deploy -N ""
   ```

   En la VPS, agregá la **pública** al usuario que usa `VPS_USER`:

   ```bash
   mkdir -p ~/.ssh && chmod 700 ~/.ssh
   cat bentoo_deploy.pub >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

   En GitHub, pegá el contenido **completo** de `bentoo_deploy` (la privada):

   ```
   -----BEGIN OPENSSH PRIVATE KEY-----
   ...
   -----END OPENSSH PRIVATE KEY-----
   ```

   No pegues la `.pub`, ni la ruta del archivo, ni una clave `.ppk` de PuTTY.

   Verificá localmente antes de subir el secret:

   ```bash
   ssh-keygen -y -f bentoo_deploy
   # Si imprime la clave pública, el formato es válido
   ```

### Pipeline

```
push main → build Docker image → push to Docker Hub → SSH nativo al VPS → pull + up
```

Prisma migrations run automatically on container start via `scripts/docker-entrypoint.sh`.

### One-time VPS setup

```bash
ssh usuario@tu-vps
sudo mkdir -p /var/www/resto-management-backend
cd /var/www/resto-management-backend

# Solo necesitás compose + .env en el servidor (no hace falta clonar todo el repo)
# Copiá docker-compose.prod.yml y creá .env con tus variables de producción
nano .env

docker compose -f docker-compose.prod.yml up -d
```

Generate a deploy key for GitHub Actions:

```bash
ssh-keygen -t ed25519 -C "github-actions-bentoo-deploy" -f bentoo_deploy -N ""
# bentoo_deploy.pub → authorized_keys del VPS_USER en la VPS
# bentoo_deploy (privada) → secret VPS_SSH_KEY en GitHub (environment production)
ssh-keygen -y -f bentoo_deploy   # validar formato antes de pegar en GitHub
```

### Manual VPS deploy

If auto deploy is disabled (`VPS_DEPLOY_ENABLED` unset or not `true`), update the server manually:

```bash
docker compose -f docker-compose.prod.yml pull app
docker compose -f docker-compose.prod.yml up -d app
```

Migrations are applied on container start. To run them explicitly:

```bash
docker compose -f docker-compose.prod.yml run --rm app npx prisma migrate deploy
docker compose -f docker-compose.prod.yml up -d app
```

## Optional image pinning

You can deploy a specific image version instead of `latest`:

```bash
export DOCKERHUB_IMAGE=valenfontana7/resto-management-backend:sha-<commit>
docker compose -f docker-compose.prod.yml pull app
docker compose -f docker-compose.prod.yml up -d app
```
