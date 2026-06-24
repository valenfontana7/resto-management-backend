/**
 * Normaliza emails para almacenamiento (trim + lowercase).
 */
export function normalizeEmailForStorage(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Identidad canónica para detectar alias (+tag, puntos en Gmail, etc.).
 * Dos direcciones con la misma identidad deberían tratarse como una sola cuenta.
 */
export function getEmailCanonicalIdentity(email: string): string {
  const normalized = normalizeEmailForStorage(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return normalized;

  let local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);

  if (domain === 'googlemail.com') {
    domain = 'gmail.com';
  }

  if (domain === 'gmail.com') {
    local = local.split('+')[0].replace(/\./g, '');
    return `${local}@${domain}`;
  }

  local = local.split('+')[0];
  return `${local}@${domain}`;
}

export function emailsShareIdentity(a: string, b: string): boolean {
  return getEmailCanonicalIdentity(a) === getEmailCanonicalIdentity(b);
}
