-- Fix image paths from dishs to dishes and categorys to categories
UPDATE "Dish" 
SET image = REPLACE(image, '/uploads/dishs/', '/uploads/dishes/')
WHERE image LIKE '%/dishs/%';

UPDATE "Category" 
SET image = REPLACE(image, '/uploads/categorys/', '/uploads/categories/')
WHERE image LIKE '%/categorys/%';
