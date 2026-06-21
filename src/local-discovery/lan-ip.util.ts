import { networkInterfaces } from 'os';

const PRIVATE_IPV4_RANGES = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

function isPrivateIpv4(address: string): boolean {
  return PRIVATE_IPV4_RANGES.some((pattern) => pattern.test(address));
}

/**
 * Primera IPv4 LAN usable para anunciar en autodiscovery (terminales XP en red).
 */
export function getPrimaryLanIPv4(): string | null {
  const nets = networkInterfaces();
  const candidates: string[] = [];

  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (String(entry.family) !== 'IPv4') continue;
      if (entry.internal) continue;
      if (!isPrivateIpv4(entry.address)) continue;
      candidates.push(entry.address);
    }
  }

  return candidates[0] ?? null;
}

export function buildLocalServerAdvertisedUrl(
  port: number,
  explicitHost?: string,
): string {
  const host = explicitHost?.trim() || getPrimaryLanIPv4() || '127.0.0.1';
  return `http://${host}:${port}`;
}
