const DEFAULT_EMAIL_PUBLIC_ORIGIN = 'https://www.bentoo.com.ar';

function normalizeHttpOrigin(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

/**
 * Origen público para assets embebidos en correos (img src).
 * Los clientes de correo no pueden resolver localhost.
 */
export function getEmailPublicBaseUrl(): string {
  const explicit = (process.env.EMAIL_PUBLIC_BASE_URL || '').trim();
  if (explicit) {
    const explicitOrigin = normalizeHttpOrigin(explicit);
    if (explicitOrigin && !isLoopbackOrigin(explicitOrigin)) {
      return explicitOrigin;
    }
  }

  const candidates = [
    process.env.FRONTEND_URL,
    process.env.BASE_URL,
    process.env.BACKEND_URL,
  ];

  for (const raw of candidates) {
    const origin = normalizeHttpOrigin(raw);
    if (origin && !isLoopbackOrigin(origin)) {
      return origin;
    }
  }

  return DEFAULT_EMAIL_PUBLIC_ORIGIN;
}
