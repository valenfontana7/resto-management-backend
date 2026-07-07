import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ImportRollbackError } from './rollback';

/** Cliente transaccional: lo que reciben los pasos de persistencia. */
export type ImportTransactionClient = Prisma.TransactionClient;

/** Acepta tanto el PrismaService de Nest como un PrismaClient plano (CLI). */
export type ImportPrisma = PrismaClient | PrismaService;

/**
 * Ejecuta todos los pasos de persistencia dentro de UNA transacción interactiva.
 * Si cualquier paso lanza, Prisma revierte todo: la base nunca queda a medias.
 */
export async function runImportTransaction<T>(
  prisma: ImportPrisma,
  work: (tx: ImportTransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(async (tx) => work(tx), {
      timeout: 30_000,
    });
  } catch (error) {
    throw new ImportRollbackError(
      'La transacción de import falló y fue revertida por completo.',
      error as Error,
    );
  }
}
