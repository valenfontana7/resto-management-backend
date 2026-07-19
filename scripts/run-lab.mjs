import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const environmentPath = join(repositoryRoot, '.env.lab');

const forbiddenKeys = new Set([
  'REDIS_URL',
  'RESEND_API_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'S3_KEY',
  'S3_SECRET',
  'S3_BUCKET',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_PUBLIC_BASE_URL',
  'GEMINI_API_KEY',
  'MERCADOPAGO_ACCESS_TOKEN',
  'MERCADOPAGO_PUBLIC_KEY',
  'MERCADOPAGO_OAUTH_CLIENT_ID',
  'MERCADOPAGO_OAUTH_CLIENT_SECRET',
  'MERCADOPAGO_OAUTH_STATE_SECRET',
  'PAYWAY_API_KEY',
  'PAYWAY_SECRET_KEY',
  'ARCA_CERT',
  'ARCA_PRIVATE_KEY',
  'AFIP_CERT',
  'AFIP_PRIVATE_KEY',
]);

const inheritedEnvironmentKeys = new Set([
  'APPDATA',
  'CI',
  'COMSPEC',
  'HOME',
  'LOCALAPPDATA',
  'NUMBER_OF_PROCESSORS',
  'PATH',
  'PATHEXT',
  'PROCESSOR_ARCHITECTURE',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PROGRAMW6432',
  'SYSTEMDRIVE',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'WINDIR',
]);

function fail(message) {
  process.stderr.write(`[Bentoo Lab] ${message}\n`);
  process.exit(1);
}

if (!existsSync(environmentPath)) {
  fail('Falta .env.lab. Copiá .env.lab.example y completá solo valores locales.');
}

const labEnvironment = parse(readFileSync(environmentPath));
const configuredForbiddenKeys = [...forbiddenKeys].filter((key) =>
  Boolean(labEnvironment[key]?.trim()),
);
if (configuredForbiddenKeys.length > 0) {
  fail(
    `La configuración contiene fronteras externas prohibidas: ${configuredForbiddenKeys.join(', ')}`,
  );
}

const childEnvironment = {};
for (const [key, value] of Object.entries(process.env)) {
  if (inheritedEnvironmentKeys.has(key.toUpperCase()) && value !== undefined) {
    childEnvironment[key] = value;
  }
}
Object.assign(childEnvironment, labEnvironment, {
  BENTOO_RUNTIME_MODE: 'lab',
  DOTENV_CONFIG_PATH: environmentPath,
});

const node = process.execPath;
const command = process.argv[2] ?? 'dev';
const nestCli = join(repositoryRoot, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');
const prismaCli = join(repositoryRoot, 'node_modules', 'prisma', 'build', 'index.js');
const jestCli = join(repositoryRoot, 'node_modules', 'jest', 'bin', 'jest.js');
const tsNodeRegister = join(repositoryRoot, 'node_modules', 'ts-node', 'register');
const tsconfigPathsRegister = join(
  repositoryRoot,
  'node_modules',
  'tsconfig-paths',
  'register',
);

function run(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(node, args, {
      cwd: repositoryRoot,
      env: childEnvironment,
      stdio: 'inherit',
    });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (signal) {
        rejectRun(new Error(`Proceso detenido por ${signal}`));
        return;
      }
      resolveRun(code ?? 1);
    });
  });
}

let exitCode;
switch (command) {
  case 'dev':
    exitCode = await run([nestCli, 'start', '--watch']);
    break;
  case 'setup': {
    exitCode = await run([prismaCli, 'migrate', 'deploy']);
    if (exitCode === 0) {
      exitCode = await run([
        '-r',
        tsNodeRegister,
        '-r',
        tsconfigPathsRegister,
        'src/bentoo-lab/cli/lab-admin-seed.cli.ts',
      ]);
    }
    break;
  }
  case 'run':
    childEnvironment.BENTOO_LAB_JSON_STDOUT = 'true';
    exitCode = await run([
      '-r',
      tsNodeRegister,
      '-r',
      tsconfigPathsRegister,
      'src/bentoo-lab/cli/lab-run.cli.ts',
      ...process.argv.slice(3),
    ]);
    break;
  case 'test':
    exitCode = await run([
      jestCli,
      '--config',
      'test/jest-e2e-lab.json',
      '--runInBand',
      ...process.argv.slice(3),
    ]);
    break;
  default:
    fail(`Comando desconocido: ${command}. Usá dev, setup, run o test.`);
}

process.exit(exitCode);
