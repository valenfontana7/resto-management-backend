import { readFile } from 'node:fs/promises';
import { SUPPORTED_SCHEMA_VERSIONS, ProspectBundle } from './types';

export class BundleParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleParseError';
  }
}

/** Carga y parsea un bundle desde disco. Solo I/O + JSON; la validación semántica vive en validator.ts. */
export async function loadBundleFromFile(
  filePath: string,
): Promise<ProspectBundle> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new BundleParseError(
      `No se pudo leer el bundle en "${filePath}": ${(error as Error).message}`,
    );
  }

  return parseBundle(raw);
}

export function parseBundle(raw: string): ProspectBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new BundleParseError(
      `El bundle no es JSON válido: ${(error as Error).message}`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BundleParseError('El bundle debe ser un objeto JSON raíz.');
  }

  const bundle = parsed as ProspectBundle;

  if (!bundle.schemaVersion) {
    throw new BundleParseError('El bundle no declara schemaVersion.');
  }

  if (!SUPPORTED_SCHEMA_VERSIONS.includes(bundle.schemaVersion as never)) {
    throw new BundleParseError(
      `schemaVersion "${bundle.schemaVersion}" no soportada. Soportadas: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}.`,
    );
  }

  return bundle;
}
