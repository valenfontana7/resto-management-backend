const DEFAULT_DEV_JWT_SECRET = 'dev-only-jwt-secret';

export function getJwtSecret(value?: string): string {
  const secret = value?.trim();
  if (secret) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }

  return DEFAULT_DEV_JWT_SECRET;
}
