-- Hard-delete of restaurants failed when Dish/Table were removed before
-- TableSessionItem / TableSession rows (RESTRICT FKs). Align with Cascade.
ALTER TABLE "TableSessionItem" DROP CONSTRAINT "TableSessionItem_dishId_fkey";
ALTER TABLE "TableSessionItem" ADD CONSTRAINT "TableSessionItem_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_dishId_fkey";
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TableSession" DROP CONSTRAINT "TableSession_tableId_fkey";
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
