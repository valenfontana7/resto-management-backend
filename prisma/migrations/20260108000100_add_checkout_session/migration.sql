-- CreateTable
CREATE TABLE "CheckoutSession" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "publicTrackingToken" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT,
  "customerPhone" TEXT NOT NULL,
  "type" "OrderType" NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "paymentId" TEXT,
  "preferenceId" TEXT,
  "isSandbox" BOOLEAN NOT NULL DEFAULT false,
  "items" JSONB NOT NULL,
  "subtotal" INTEGER NOT NULL,
  "deliveryFee" INTEGER NOT NULL DEFAULT 0,
  "discount" INTEGER NOT NULL DEFAULT 0,
  "tip" INTEGER NOT NULL DEFAULT 0,
  "total" INTEGER NOT NULL,
  "deliveryAddress" TEXT,
  "deliveryNotes" TEXT,
  "tableId" TEXT,
  "notes" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_publicTrackingToken_key" ON "CheckoutSession"("publicTrackingToken");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_restaurantId_orderNumber_key" ON "CheckoutSession"("restaurantId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_preferenceId_key" ON "CheckoutSession"("preferenceId");

-- CreateIndex
CREATE INDEX "CheckoutSession_restaurantId_createdAt_idx" ON "CheckoutSession"("restaurantId", "createdAt");

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;
