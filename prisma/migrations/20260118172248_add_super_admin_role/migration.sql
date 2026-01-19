-- Insert SUPER_ADMIN role if it doesn't exist
INSERT INTO "Role" ("id", "name", "permissions", "color", "isSystemRole", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'SUPER_ADMIN', '["all"]'::jsonb, '#ff0000', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Role" WHERE name = 'SUPER_ADMIN');