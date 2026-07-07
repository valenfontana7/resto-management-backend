/**
 * Semántica de rollback del importer.
 *
 * Toda la persistencia corre dentro de una transacción interactiva de Prisma
 * (`transaction.ts`): ante cualquier throw, la base revierte sola. Este error
 * envuelve la causa original para que el CLI y el reporte puedan distinguir
 * "falló y NO quedó nada escrito" de un fallo de validación previo.
 */
export class ImportRollbackError extends Error {
  readonly cause: Error;

  constructor(message: string, cause: Error) {
    super(`${message} Causa: ${cause.message}`);
    this.name = 'ImportRollbackError';
    this.cause = cause;
  }
}

export function isRollbackError(error: unknown): error is ImportRollbackError {
  return error instanceof ImportRollbackError;
}
