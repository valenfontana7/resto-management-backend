import type { PrismaService } from '../../prisma/prisma.service';

function fiscalLockSlot(puntoVenta: number, cbteTipo: number): number {
  return puntoVenta * 1000 + cbteTipo;
}

/**
 * Serializa emisiones WSFE por restaurante + PV + tipo de comprobante.
 * Usa pg_advisory_lock (sesión) para no mantener transacciones abiertas durante SOAP.
 */
export async function withFiscalAdvisoryLock<T>(
  prisma: PrismaService,
  restaurantId: string,
  puntoVenta: number,
  cbteTipo: number,
  fn: () => Promise<T>,
): Promise<T> {
  const slot = fiscalLockSlot(puntoVenta, cbteTipo);

  await prisma.$executeRaw`
    SELECT pg_advisory_lock(hashtext(${restaurantId}), ${slot})
  `;

  try {
    return await fn();
  } finally {
    await prisma.$executeRaw`
      SELECT pg_advisory_unlock(hashtext(${restaurantId}), ${slot})
    `;
  }
}
