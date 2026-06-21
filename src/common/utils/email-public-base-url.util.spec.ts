import { getEmailPublicBaseUrl } from './email-public-base-url.util';

describe('getEmailPublicBaseUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.EMAIL_PUBLIC_BASE_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('usa EMAIL_PUBLIC_BASE_URL cuando está definida', () => {
    process.env.EMAIL_PUBLIC_BASE_URL = 'https://cdn.example.com/';
    expect(getEmailPublicBaseUrl()).toBe('https://cdn.example.com');
  });

  it('ignora EMAIL_PUBLIC_BASE_URL localhost y cae al dominio público', () => {
    process.env.EMAIL_PUBLIC_BASE_URL = 'http://localhost:3000';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    expect(getEmailPublicBaseUrl()).toBe('https://www.bentoo.com.ar');
  });

  it('ignora FRONTEND_URL localhost y cae al dominio público', () => {
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.BACKEND_URL = 'http://localhost:4000';
    expect(getEmailPublicBaseUrl()).toBe('https://www.bentoo.com.ar');
  });

  it('prefiere FRONTEND_URL público', () => {
    process.env.FRONTEND_URL = 'https://www.bentoo.com.ar/';
    expect(getEmailPublicBaseUrl()).toBe('https://www.bentoo.com.ar');
  });
});
