import { createHash, randomBytes, randomUUID } from 'crypto';

export function generateEdgeLocalId(): string {
  return randomUUID();
}

export function generateEdgeSyncToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashEdgeSyncToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyEdgeSyncToken(token: string, hash: string): boolean {
  if (!token?.trim() || !hash?.trim()) return false;
  const incoming = hashEdgeSyncToken(token.trim());
  return incoming.length === hash.length && incoming === hash;
}
