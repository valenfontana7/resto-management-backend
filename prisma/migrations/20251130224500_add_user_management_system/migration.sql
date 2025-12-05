-- CreateTable: Role
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "isSystemRole" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Role_restaurantId_idx" ON "Role"("restaurantId");
CREATE UNIQUE INDEX "Role_restaurantId_name_key" ON "Role"("restaurantId", "name");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Insert default system roles for each existing restaurant
INSERT INTO "Role" ("id", "restaurantId", "name", "permissions", "color", "isSystemRole", "createdAt", "updatedAt")
SELECT 
    substr(md5(random()::text || clock_timestamp()::text), 1, 25),
    r.id,
    'Admin',
    '["all"]'::jsonb,
    '#ef4444',
    true,
    NOW(),
    NOW()
FROM "Restaurant" r;

INSERT INTO "Role" ("id", "restaurantId", "name", "permissions", "color", "isSystemRole", "createdAt", "updatedAt")
SELECT 
    substr(md5(random()::text || clock_timestamp()::text), 1, 25),
    r.id,
    'Manager',
    '["manage_menu", "manage_orders", "view_reports", "manage_tables", "manage_reservations"]'::jsonb,
    '#f59e0b',
    true,
    NOW(),
    NOW()
FROM "Restaurant" r;

INSERT INTO "Role" ("id", "restaurantId", "name", "permissions", "color", "isSystemRole", "createdAt", "updatedAt")
SELECT 
    substr(md5(random()::text || clock_timestamp()::text), 1, 25),
    r.id,
    'Waiter',
    '["take_orders", "manage_orders", "view_tables"]'::jsonb,
    '#3b82f6',
    true,
    NOW(),
    NOW()
FROM "Restaurant" r;

INSERT INTO "Role" ("id", "restaurantId", "name", "permissions", "color", "isSystemRole", "createdAt", "updatedAt")
SELECT 
    substr(md5(random()::text || clock_timestamp()::text), 1, 25),
    r.id,
    'Kitchen',
    '["view_orders", "update_order_status"]'::jsonb,
    '#8b5cf6',
    true,
    NOW(),
    NOW()
FROM "Restaurant" r;

INSERT INTO "Role" ("id", "restaurantId", "name", "permissions", "color", "isSystemRole", "createdAt", "updatedAt")
SELECT 
    substr(md5(random()::text || clock_timestamp()::text), 1, 25),
    r.id,
    'Delivery',
    '["view_delivery_orders", "update_delivery_status"]'::jsonb,
    '#10b981',
    true,
    NOW(),
    NOW()
FROM "Restaurant" r;

-- Add roleId column (nullable first)
ALTER TABLE "User" ADD COLUMN "roleId" TEXT;
ALTER TABLE "User" ADD COLUMN "lastLogin" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "avatar" TEXT;
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Migrate existing users: map old enum roles to new Role records
UPDATE "User" u
SET "roleId" = (
    SELECT r.id 
    FROM "Role" r 
    WHERE r."restaurantId" = u."restaurantId" 
    AND r.name = 'Admin' 
    LIMIT 1
)
WHERE u.role IN ('SUPER_ADMIN', 'OWNER');

UPDATE "User" u
SET "roleId" = (
    SELECT r.id 
    FROM "Role" r 
    WHERE r."restaurantId" = u."restaurantId" 
    AND r.name = 'Manager' 
    LIMIT 1
)
WHERE u.role = 'MANAGER';

UPDATE "User" u
SET "roleId" = (
    SELECT r.id 
    FROM "Role" r 
    WHERE r."restaurantId" = u."restaurantId" 
    AND r.name = 'Waiter' 
    LIMIT 1
)
WHERE u.role = 'WAITER';

UPDATE "User" u
SET "roleId" = (
    SELECT r.id 
    FROM "Role" r 
    WHERE r."restaurantId" = u."restaurantId" 
    AND r.name = 'Kitchen' 
    LIMIT 1
)
WHERE u.role = 'CHEF';

UPDATE "User" u
SET "roleId" = (
    SELECT r.id 
    FROM "Role" r 
    WHERE r."restaurantId" = u."restaurantId" 
    AND r.name = 'Delivery' 
    LIMIT 1
)
WHERE u.role = 'DELIVERY';

-- Make roleId NOT NULL now that data is migrated
ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL;

-- Drop old email unique constraint and create new composite one
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_email_key";
CREATE UNIQUE INDEX "User_restaurantId_email_key" ON "User"("restaurantId", "email");

-- Add new indexes
CREATE INDEX "User_restaurantId_roleId_idx" ON "User"("restaurantId", "roleId");
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- Add foreign key for roleId
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop old role column and enum
ALTER TABLE "User" DROP COLUMN "role";
DROP TYPE "UserRole";
