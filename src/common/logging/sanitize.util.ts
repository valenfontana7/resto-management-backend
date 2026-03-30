const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'authorization',
  'cookie',
  'secret',
  'client_secret',
  'clientSecret',
  'api_key',
  'apiKey',
  'x-signature',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function sanitizeString(value: string): string {
  if (/^bearer\s+/i.test(value)) {
    return 'Bearer [REDACTED]';
  }

  if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(value)) {
    return '[REDACTED_JWT]';
  }

  return value;
}

export function sanitizeForLogs<T>(value: T, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 3) return '[Truncated]';

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogs(item, depth + 1));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.has(key)
      ? '[REDACTED]'
      : sanitizeForLogs(entry, depth + 1);
  }

  return result;
}

export function sanitizeUrlForLogs(url: string): string {
  if (!url) return url;

  try {
    const parsed = new URL(url, 'http://localhost');
    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_KEYS.has(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }

    const path = parsed.pathname + parsed.search;
    return url.startsWith('http://') || url.startsWith('https://')
      ? `${parsed.origin}${path}`
      : path;
  } catch {
    return url;
  }
}
