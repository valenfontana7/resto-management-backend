/**
 * CLI del Prospect Importer.
 *
 * Uso (desde resto-management-backend/):
 *   npm run import-prospect -- ../prospects/fasongsong/prospect.bundle.json
 *   npm run import-prospect -- <bundle.json> --dry-run
 *
 * Requiere DATABASE_URL (usa el mismo .env del backend).
 */
import 'dotenv/config';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ProspectImporter, BundleValidationError } from './importer';
import { ImportLogger } from './logger';
import { formatReport } from './report';
import { BundleParseError } from './parser';
import { isRollbackError } from './rollback';

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const dryRun = args.includes('--dry-run');
  const bundleArg = args.find((arg) => !arg.startsWith('--'));

  if (!bundleArg) {
    console.error(
      'Uso: npm run import-prospect -- <ruta/al/prospect.bundle.json> [--dry-run]',
    );
    process.exit(2);
  }

  const bundlePath = resolve(process.cwd(), bundleArg);
  const structuredLogs = process.env.IMPORTER_LOG_JSON === '1';

  const logger = new ImportLogger((event) => {
    if (structuredLogs) {
      console.log(JSON.stringify(event));
    } else if (event.level === 'error') {
      console.error(`  [${event.step}] ${event.message}`);
    }
  });

  console.log('Loading bundle...');
  console.log(`  ${bundlePath}`);
  console.log('');
  console.log('Validating...');

  if (!process.env.DATABASE_URL && !dryRun) {
    console.error('DATABASE_URL no configurada (se lee del .env del backend).');
    process.exit(2);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ['error'],
  });
  const importer = new ProspectImporter(prisma, logger);

  try {
    console.log('');
    console.log(dryRun ? 'Importing (dry run)...' : 'Importing...');
    console.log('');
    console.log('Committing...');

    const report = await importer.importFromFile(bundlePath, {
      dryRun,
      frontendUrl: process.env.FRONTEND_URL,
      importedBy: process.env.IMPORTER_USER ?? 'prospect-importer-cli',
    });

    console.log('');
    console.log(
      dryRun ? 'Dry run successful (nada persistido).' : 'Import successful.',
    );
    console.log('');
    console.log('Restaurant ID:');
    console.log(`  ${report.restaurantId ?? '(dry run)'}`);
    console.log('');
    console.log('Slug:');
    console.log(`  ${report.slug}`);
    console.log('');
    console.log('Demo URL:');
    console.log(`  ${report.urls.demo}`);
    console.log('');
    console.log('Editor URL:');
    console.log(`  ${report.urls.masterEditor}`);
    console.log('');
    console.log('Warnings:');
    if (report.warnings.length === 0) {
      console.log('  (ninguno)');
    } else {
      for (const warning of report.warnings) console.log(`  - ${warning}`);
    }
    console.log('');
    console.log(formatReport(report));
    console.log('');
    console.log('Done.');
  } catch (error) {
    console.error('');
    if (error instanceof BundleValidationError) {
      console.error(
        `Import rechazado: ${error.validationErrors.length} errores de validación.`,
      );
      for (const validationError of error.validationErrors) {
        console.error(`  - ${validationError}`);
      }
    } else if (error instanceof BundleParseError) {
      console.error(`Import rechazado: ${error.message}`);
    } else if (isRollbackError(error)) {
      console.error(`Import fallido: ${error.message}`);
      console.error('La base de datos fue revertida; no quedó estado parcial.');
    } else {
      console.error(`Import fallido: ${(error as Error).message}`);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main();
