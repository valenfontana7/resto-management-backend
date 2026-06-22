-- DeliveryOrder: esperar cocina antes de READY/dispatch
ALTER TYPE "DeliveryStatus" ADD VALUE 'PENDING';

ALTER TABLE "DeliveryOrder" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- Pedidos aún en cocina no deberían figurar como listos para despacho
UPDATE "DeliveryOrder" AS d
SET
  "status" = 'PENDING',
  "readyAt" = NULL,
  "assignedAt" = NULL,
  "driverId" = NULL
FROM "Order" AS o
WHERE d."orderId" = o.id
  AND d."status" = 'READY'
  AND o."status" IN ('PENDING', 'CONFIRMED', 'PAID', 'PREPARING');
