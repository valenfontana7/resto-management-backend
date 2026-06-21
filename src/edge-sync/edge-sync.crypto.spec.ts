import {
  generateEdgeSyncToken,
  hashEdgeSyncToken,
  verifyEdgeSyncToken,
} from './edge-sync.crypto';

describe('edge-sync.crypto', () => {
  it('hashes and verifies tokens', () => {
    const token = generateEdgeSyncToken();
    const hash = hashEdgeSyncToken(token);
    expect(verifyEdgeSyncToken(token, hash)).toBe(true);
    expect(verifyEdgeSyncToken('wrong', hash)).toBe(false);
  });
});
