const VALID_NODE_ENVS = new Set(['development', 'production', 'test']);
const VALID_LOG_LEVELS = new Set([
  'error',
  'warn',
  'info',
  'http',
  'verbose',
  'debug',
  'silly',
]);

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isValidCorsOrigin(value: string): boolean {
  if (!value) return false;
  if (value === '*') return true;
  if (value.startsWith('*.')) return value.length > 2;
  if (isValidUrl(value)) return true;
  return !value.includes(' ');
}

function isValidEncryptionKey(value: string): boolean {
  if (/^[0-9a-fA-F]{64}$/.test(value)) return true;

  try {
    return Buffer.from(value, 'base64').length === 32;
  } catch {
    return false;
  }
}

export function validateEnvironment(config: Record<string, unknown>) {
  const env = { ...config } as Record<string, string | undefined>;
  const errors: string[] = [];

  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  if (!VALID_NODE_ENVS.has(nodeEnv)) {
    errors.push('NODE_ENV must be one of: development, production, test');
  }
  env.NODE_ENV = nodeEnv;

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    errors.push('DATABASE_URL is required');
  }

  const jwtSecret = env.JWT_SECRET?.trim();
  if (nodeEnv === 'production' && !jwtSecret) {
    errors.push('JWT_SECRET is required in production');
  }
  if (jwtSecret && jwtSecret.length < 16) {
    errors.push('JWT_SECRET must be at least 16 characters long');
  }

  const portRaw = env.PORT?.trim();
  if (portRaw) {
    const port = Number(portRaw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push('PORT must be an integer between 1 and 65535');
    }
  }

  const logLevel = env.LOG_LEVEL?.trim();
  if (logLevel && !VALID_LOG_LEVELS.has(logLevel)) {
    errors.push(
      'LOG_LEVEL must be one of: error, warn, info, http, verbose, debug, silly',
    );
  }

  for (const key of ['FRONTEND_URL', 'BASE_URL', 'BACKEND_URL']) {
    const value = env[key]?.trim();
    if (value && !isValidUrl(value)) {
      errors.push(`${key} must be a valid absolute URL`);
    }
  }

  const corsOrigins = env.CORS_ORIGINS?.trim();
  if (corsOrigins) {
    const invalidOrigins = corsOrigins
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !isValidCorsOrigin(item));

    if (invalidOrigins.length > 0) {
      errors.push(
        `CORS_ORIGINS contains invalid entries: ${invalidOrigins.join(', ')}`,
      );
    }
  }

  const mpKey = env.MP_TOKEN_ENCRYPTION_KEY?.trim();
  if (mpKey && !isValidEncryptionKey(mpKey)) {
    errors.push(
      'MP_TOKEN_ENCRYPTION_KEY must be 64 hex chars or base64 for 32 bytes',
    );
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join('; ')}`);
  }

  return env;
}
