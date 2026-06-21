/** Debe coincidir con Bentoo.Salon.Core.Discovery.LocalServerDiscovery (Desktop XP). */
export const BENTOO_DISCOVERY_PORT = 40200;
export const BENTOO_DISCOVERY_REQUEST = 'BENTOO_DISCOVER_v1';
export const BENTOO_DISCOVERY_PREFIX = 'BENTOO_SERVER|';

export function parseDiscoveryRequest(payload: Buffer): string | null {
  const text = payload.toString('utf8').trim();
  return text === BENTOO_DISCOVERY_REQUEST ? text : null;
}

export function buildDiscoveryResponse(serverBaseUrl: string): Buffer {
  return Buffer.from(`${BENTOO_DISCOVERY_PREFIX}${serverBaseUrl}`, 'utf8');
}
