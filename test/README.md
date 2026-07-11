# E2E tests (backend)

## Auth boundaries (default)

```bash
npm run test:e2e
```

No requiere DB seeded: verifica 401/403 en rutas críticas.

## Flujos dorados con Postgres

Requiere `DATABASE_URL` apuntando a una base de **test** (no producción) y migraciones al día:

```bash
cd resto-management-backend
npx prisma migrate deploy
npm run test:e2e:golden
```

El helper `test/helpers/e2e-seed.helper.ts` crea dos tenants efímeros y ejecuta:

1. Apertura de caja parcial
2. Apertura de mesa → ítems → comanda → cobro efectivo
3. Verificación de filas en `OperationalOutbox`
4. Pedido público takeaway + outbox `operational.order.created`
5. Apertura de turno operativo + proyección La Línea
6. Terminales multi-PC (registro + ping + listado)
7. Cross-tenant 403
8. Integración delivery (ownership + alta PEDIDOS_YA)
9. Tenant health 360 (super-admin + playbooks estructurados)
10. Decision analytics (menu-engineering + channel-economics)

Los datos se eliminan en `afterAll`.

## Tenancy matrix (manual CI)

Opcionalmente exportá tokens de tenants persistentes:

```
E2E_TENANT_A_TOKEN=
E2E_TENANT_A_RESTAURANT_ID=
E2E_TENANT_B_RESTAURANT_ID=
```

Usado por `tenancy.e2e-spec.ts`.

## Auditoría de guards

```bash
node scripts/tenancy-audit.mjs
```
