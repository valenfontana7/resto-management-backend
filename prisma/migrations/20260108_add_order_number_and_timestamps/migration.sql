-- AlterEnum: Add PAID status to OrderStatus
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAID';

-- AlterTable: Add new columns to Order
ALTER TABLE "Order" ADD COLUMN "orderNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliveryNotes" TEXT;
ALTER TABLE "Order" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "preparingAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "readyAt" TIMESTAMP(3);

-- Generate orderNumber for existing orders (por restaurante y por día)
WITH numbered AS (
	SELECT
		id,
		'OD-' || TO_CHAR("createdAt", 'YYYYMMDD') || '-' ||
		LPAD(
			ROW_NUMBER() OVER (
				PARTITION BY "restaurantId", DATE("createdAt")
				ORDER BY "createdAt", id
			)::TEXT,
			3,
			'0'
		) AS generated_number
	FROM "Order"
)
UPDATE "Order" o
SET "orderNumber" = n.generated_number
FROM numbered n
WHERE o.id = n.id
	AND o."orderNumber" IS NULL;

-- Make orderNumber required
ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET NOT NULL;

-- Unique por restaurante
CREATE UNIQUE INDEX "Order_restaurantId_orderNumber_key" ON "Order"("restaurantId", "orderNumber");

-- Index para búsquedas por número
CREATE INDEX "Order_orderNumber_idx" ON "Order"("orderNumber");
