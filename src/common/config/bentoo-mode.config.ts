export type BentooMode = 'cloud' | 'local';

export function getBentooMode(
  env: Record<string, string | undefined> = process.env,
): BentooMode {
  const raw = (env.BENTOO_MODE ?? 'cloud').trim().toLowerCase();
  return raw === 'local' ? 'local' : 'cloud';
}

export function isLocalMode(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return getBentooMode(env) === 'local';
}

export function isCloudMode(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return !isLocalMode(env);
}
