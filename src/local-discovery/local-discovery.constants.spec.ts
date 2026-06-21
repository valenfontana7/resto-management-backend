import {
  BENTOO_DISCOVERY_PREFIX,
  BENTOO_DISCOVERY_REQUEST,
  buildDiscoveryResponse,
  parseDiscoveryRequest,
} from './local-discovery.constants';

describe('local-discovery.constants', () => {
  it('parses valid discovery request', () => {
    expect(
      parseDiscoveryRequest(Buffer.from(BENTOO_DISCOVERY_REQUEST, 'utf8')),
    ).toBe(BENTOO_DISCOVERY_REQUEST);
  });

  it('rejects unknown payloads', () => {
    expect(parseDiscoveryRequest(Buffer.from('PING', 'utf8'))).toBeNull();
  });

  it('builds response compatible with Desktop XP client', () => {
    const response = buildDiscoveryResponse('http://192.168.0.10:4000');
    expect(response.toString('utf8')).toBe(
      `${BENTOO_DISCOVERY_PREFIX}http://192.168.0.10:4000`,
    );
  });
});
