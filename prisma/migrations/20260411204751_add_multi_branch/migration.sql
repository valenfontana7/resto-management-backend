-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "parentId" TEXT;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
