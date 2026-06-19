import { isValidCuit, normalizeCuit } from './afip-cuit.util';

describe('afip-cuit.util', () => {
  it('validates CUIT checksum', () => {
    expect(isValidCuit('20-12345678-6')).toBe(true);
    expect(isValidCuit('20-12345678-9')).toBe(false);
    expect(normalizeCuit('20-12345678-6')).toBe('20123456786');
  });

  it('rejects invalid length', () => {
    expect(isValidCuit('123')).toBe(false);
  });
});
