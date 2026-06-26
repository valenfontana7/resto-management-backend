import { hashDeviceToken, verifyDeviceToken } from './device-token.crypto';

describe('device-token.crypto', () => {
  it('hashea y verifica tokens', () => {
    const token = 'sample-device-jwt-token';
    const hash = hashDeviceToken(token);
    expect(verifyDeviceToken(token, hash)).toBe(true);
    expect(verifyDeviceToken('other', hash)).toBe(false);
  });
});
