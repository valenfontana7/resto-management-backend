import { validateEnvironment } from './env.validation';

const baseEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/bentoo_lab',
  JWT_SECRET: 'lab-jwt-secret-with-at-least-16-characters',
  BENTOO_LAB_INTERNAL_TOKEN: 'lab-internal-token-at-least-16',
};

describe('validateEnvironment en runtime Lab', () => {
  it('acepta una base local dedicada de Lab', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        BENTOO_RUNTIME_MODE: 'lab',
      }),
    ).not.toThrow();
  });

  it.each([
    'postgresql://postgres:postgres@127.0.0.1:5432/bentoo',
    'postgresql://postgres:postgres@db.example.com:5432/bentoo_lab',
  ])('rechaza una base no exclusiva: %s', (databaseUrl) => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        BENTOO_RUNTIME_MODE: 'lab',
        DATABASE_URL: databaseUrl,
      }),
    ).toThrow(/Lab/i);
  });

  it.each([
    'REDIS_URL',
    'RESEND_API_KEY',
    'VAPID_PRIVATE_KEY',
    'S3_SECRET',
    'GEMINI_API_KEY',
    'MERCADOPAGO_ACCESS_TOKEN',
  ])('rechaza la frontera externa configurada %s', (key) => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        BENTOO_RUNTIME_MODE: 'lab',
        [key]: 'configured-secret',
      }),
    ).toThrow(new RegExp(key));
  });

  it('requiere un token interno no trivial', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        BENTOO_RUNTIME_MODE: 'lab',
        BENTOO_LAB_INTERNAL_TOKEN: '',
      }),
    ).toThrow(/BENTOO_LAB_INTERNAL_TOKEN/);
  });

  it('conserva el comportamiento normal fuera de Lab', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        DATABASE_URL:
          'postgresql://postgres:postgres@db.example.com:5432/bentoo',
      }),
    ).not.toThrow();
  });
});
