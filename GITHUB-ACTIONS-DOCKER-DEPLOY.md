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

## VPS deploy flow

Once the image was published, update the server with:

```bash
docker compose -f docker-compose.prod.yml pull app
docker compose -f docker-compose.prod.yml up -d app
```

If the release includes Prisma migrations:

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
