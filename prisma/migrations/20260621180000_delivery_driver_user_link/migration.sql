-- Link delivery drivers to admin users (repartidor panel)
ALTER TABLE "DeliveryDriver" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "DeliveryDriver_restaurantId_userId_key"
  ON "DeliveryDriver"("restaurantId", "userId");

CREATE INDEX "DeliveryDriver_userId_idx" ON "DeliveryDriver"("userId");

ALTER TABLE "DeliveryDriver"
  ADD CONSTRAINT "DeliveryDriver_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
