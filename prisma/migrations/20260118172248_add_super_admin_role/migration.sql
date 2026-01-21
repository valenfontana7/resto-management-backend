-- Insert SUPER_ADMIN role per restaurant if it doesn't exist
INSERT INTO "Role" ("id", "restaurantId", "name", "permissions", "color", "isSystemRole", "createdAt", "updatedAt")
SELECT
	gen_random_uuid(),
	r.id,
	'SUPER_ADMIN',
	'["all"]'::jsonb,
	'#ff0000',
	true,
	NOW(),
	NOW()
FROM "Restaurant" r
WHERE NOT EXISTS (
	SELECT 1 FROM "Role" WHERE name = 'SUPER_ADMIN' AND "restaurantId" = r.id
);