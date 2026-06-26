import { createHash } from 'crypto';

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

export function verifyDeviceToken(
  token: string,
  hash: string | null | undefined,
): boolean {
  if (!token?.trim() || !hash?.trim()) return false;
  const incoming = hashDeviceToken(token);
  return incoming.length === hash.length && incoming === hash;
}
