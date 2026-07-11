#!/usr/bin/env node
/**
 * Verifica que AppModule bootstrap desde dist no tenga tokens undefined (Linux CI).
 * Correr después de `npm run build`.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'ci-jwt-secret-for-golden-flows-only-32chars';
process.env.MP_TOKEN_ENCRYPTION_KEY ??=
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.DATABASE_URL ??=
  'postgresql://bentoo:bentoo_ci@localhost:5432/bentoo_ci?schema=public';

const tokenPaths = [
  'dist/app.module',
  'dist/orders/orders.module',
  'dist/orders/orders.service',
  'dist/orders/services/order-notifications.service',
  'dist/delivery/delivery.service',
  'dist/floor/floor.module',
  'dist/floor/services/table-session.service',
  'dist/kitchen/kitchen.module',
  'dist/kitchen/kitchen-notifications.service',
  'dist/event-spine/event-spine.module',
  'dist/event-spine/handlers/kitchen-operational.handler',
  'dist/event-spine/operational-event-emitter.service',
  'dist/edge-sync/edge-sync.module',
  'dist/edge-sync/edge-sync-push-apply.service',
  'dist/tenant-health/tenant-health.module',
  'dist/tenant-health/tenant-health.service',
];

const failures = [];

for (const rel of tokenPaths) {
  const abs = path.join(root, rel);
  let mod;
  try {
    mod = require(abs);
  } catch (error) {
    failures.push(`${rel}: require failed — ${error instanceof Error ? error.message : error}`);
    continue;
  }
  for (const [exportName, value] of Object.entries(mod)) {
    if (
      exportName.endsWith('Module') ||
      exportName.endsWith('Service') ||
      exportName.endsWith('Handler')
    ) {
      if (value === undefined) {
        failures.push(`${rel}: export ${exportName} is undefined`);
      } else if (typeof value !== 'function') {
        failures.push(`${rel}: export ${exportName} is ${typeof value}, expected function`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('golden-bootstrap-check FAILED\n');
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require(path.join(root, 'dist/app.module'));

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  await app.close();
  console.log('golden-bootstrap-check OK');
}

bootstrap().catch((error) => {
  console.error('golden-bootstrap-check NestFactory FAILED');
  console.error(error);
  process.exit(1);
});
