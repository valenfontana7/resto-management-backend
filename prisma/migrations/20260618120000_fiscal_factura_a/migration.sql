-- AlterEnum
ALTER TYPE "FiscalDocumentType" ADD VALUE 'FACTURA_A';

-- AlterTable
ALTER TABLE "FiscalDocument" ADD COLUMN "customerIvaCondition" INTEGER;
ALTER TABLE "FiscalDocument" ADD COLUMN "relatedFiscalDocumentId" TEXT;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_relatedFiscalDocumentId_fkey" FOREIGN KEY ("relatedFiscalDocumentId") REFERENCES "FiscalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "FiscalDocument_relatedFiscalDocumentId_idx" ON "FiscalDocument"("relatedFiscalDocumentId");
