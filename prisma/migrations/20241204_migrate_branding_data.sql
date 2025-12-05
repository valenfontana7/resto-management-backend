-- Migrate existing restaurant data to new JSON structure
UPDATE "Restaurant"
SET 
  branding = jsonb_build_object(
    'colors', jsonb_build_object(
      'primary', COALESCE(logo, '#4f46e5'),
      'secondary', '#9333ea',
      'accent', '#ec4899',
      'text', '#1f2937',
      'background', '#ffffff'
    ),
    'layout', jsonb_build_object(
      'menuStyle', 'grid',
      'categoryDisplay', 'tabs',
      'showHeroSection', true,
      'showStats', true,
      'compactMode', false
    ),
    'typography', jsonb_build_object(
      'fontFamily', 'Inter',
      'fontSize', 'md'
    )
  ),
  features = jsonb_build_object(
    'onlineOrdering', true,
    'reservations', true,
    'delivery', false,
    'takeaway', true,
    'reviews', true,
    'socialMedia', true
  ),
  "socialMedia" = '{}'::jsonb
WHERE branding IS NULL;
