import type { ScheduleModuleOptions } from '@nestjs/schedule';

export type BentooMode = 'cloud' | 'local';
export type BentooRuntimeMode = 'normal' | 'lab';

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

export function getBentooRuntimeMode(
  env: Record<string, string | undefined> = process.env,
): BentooRuntimeMode {
  return env.BENTOO_RUNTIME_MODE?.trim().toLowerCase() === 'lab'
    ? 'lab'
    : 'normal';
}

export function isLabRuntime(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return getBentooRuntimeMode(env) === 'lab';
}

export function getSchedulerOptions(
  env: Record<string, string | undefined> = process.env,
): ScheduleModuleOptions {
  const enabled = !isLabRuntime(env);
  return {
    cronJobs: enabled,
    intervals: enabled,
    timeouts: enabled,
  };
}
