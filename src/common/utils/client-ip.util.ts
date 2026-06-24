import type { Request } from 'express';

/**
 * Resuelve la IP del cliente respetando proxies de confianza.
 * Preferir el primer hop de X-Forwarded-For cuando el request llega vía reverse proxy.
 */
export function getClientIp(
  req: Pick<Request, 'ip' | 'headers' | 'socket'>,
): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim() || 'unknown';
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
}
