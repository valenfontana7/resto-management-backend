#!/usr/bin/env node
/**
 * Audita controllers NestJS con :restaurantId en la ruta.
 * Reporta archivos sin RestaurantOwnerGuard ni VerifyRestaurantAccess a nivel de clase.
 *
 * Uso: node scripts/tenancy-audit.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
    } else if (entry.endsWith('.controller.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

const controllers = walk(root);
const withRestaurantParam = [];
const missingGuard = [];

for (const file of controllers) {
  const content = readFileSync(file, 'utf8');
  if (!content.includes(':restaurantId') && !content.includes("Param('restaurantId')")) {
    continue;
  }

  withRestaurantParam.push(file);
  const hasGuard =
    content.includes('RestaurantOwnerGuard') ||
    content.includes('VerifyRestaurantAccess') ||
    content.includes('verifyUserBelongsToRestaurant') ||
    content.includes('verifyUserOwnsRestaurant') ||
    content.includes("Roles('SUPER_ADMIN')");

  if (!hasGuard) {
    missingGuard.push(relative(root, file));
  }
}

console.log(`Controllers con restaurantId: ${withRestaurantParam.length}`);
console.log(`Sin guard/ownership explícito: ${missingGuard.length}`);

if (missingGuard.length) {
  console.log('\nRevisar (pueden ser públicos intencionales):');
  for (const path of missingGuard.sort()) {
    console.log(`  - ${path}`);
  }
  process.exitCode = 1;
} else {
  console.log('OK — todos tienen algún mecanismo de tenancy.');
}
