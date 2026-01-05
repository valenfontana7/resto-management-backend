const { Pool } = require('pg');
(async () => {
  let raw = process.env.DATABASE_URL || '';
  if (!raw) {
    try {
      const fs = require('fs');
      const env = fs.readFileSync('./.env', 'utf8');
      const m = env.match(/^DATABASE_URL=(.*)$/m);
      if (m) raw = m[1].trim();
    } catch (e) {}
  }
  const conn = raw.trim().replace(/^"|"$/g, '');
  const pool = new Pool({ connectionString: conn });

  const candidateColumns = [
    'hero_overlay_opacity',
    'hero_overlay_color',
    'hero_text_shadow',
    'hero_text_align',
    'hero_min_height',
    'sections_hero_title_color',
    'sections_hero_description_color',
  ];

  try {
    // detect which columns exist
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='"Restaurant"'`,
    );
    // fallback: also try lowercase table name
    let cols = res.rows.map((r) => r.column_name);
    if (cols.length === 0) {
      const r2 = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='restaurant'`,
      );
      cols = r2.rows.map((r) => r.column_name);
    }

    const existing = candidateColumns.filter((c) => cols.includes(c));
    if (existing.length === 0) {
      console.log('No flat branding columns detected. Nothing to migrate.');
      process.exit(0);
    }

    console.log('Detected flat columns:', existing);

    // For each column, perform JSONB update where column is not null
    const updates = [];

    if (cols.includes('hero_overlay_opacity')) {
      updates.push(
        `UPDATE public."Restaurant" SET branding = jsonb_set(coalesce(branding,'{}'::jsonb), '{hero,overlayOpacity}', to_jsonb(hero_overlay_opacity::int)) WHERE hero_overlay_opacity IS NOT NULL;`,
      );
    }
    if (cols.includes('hero_overlay_color')) {
      updates.push(
        `UPDATE public."Restaurant" SET branding = jsonb_set(coalesce(branding,'{}'::jsonb), '{hero,overlayColor}', to_jsonb(hero_overlay_color::text)) WHERE hero_overlay_color IS NOT NULL;`,
      );
    }
    if (cols.includes('hero_text_shadow')) {
      updates.push(
        `UPDATE public."Restaurant" SET branding = jsonb_set(coalesce(branding,'{}'::jsonb), '{hero,textShadow}', to_jsonb(hero_text_shadow::boolean)) WHERE hero_text_shadow IS NOT NULL;`,
      );
    }
    if (cols.includes('hero_text_align')) {
      updates.push(
        `UPDATE public."Restaurant" SET branding = jsonb_set(coalesce(branding,'{}'::jsonb), '{hero,textAlign}', to_jsonb(hero_text_align::text)) WHERE hero_text_align IS NOT NULL;`,
      );
    }
    if (cols.includes('hero_min_height')) {
      updates.push(
        `UPDATE public."Restaurant" SET branding = jsonb_set(coalesce(branding,'{}'::jsonb), '{hero,minHeight}', to_jsonb(hero_min_height::text)) WHERE hero_min_height IS NOT NULL;`,
      );
    }
    if (cols.includes('sections_hero_title_color')) {
      updates.push(
        `UPDATE public."Restaurant" SET branding = jsonb_set(coalesce(branding,'{}'::jsonb), '{sections,hero,titleColor}', to_jsonb(sections_hero_title_color::text)) WHERE sections_hero_title_color IS NOT NULL;`,
      );
    }
    if (cols.includes('sections_hero_description_color')) {
      updates.push(
        `UPDATE public."Restaurant" SET branding = jsonb_set(coalesce(branding,'{}'::jsonb), '{sections,hero,descriptionColor}', to_jsonb(sections_hero_description_color::text)) WHERE sections_hero_description_color IS NOT NULL;`,
      );
    }

    for (const q of updates) {
      console.log('Running:', q);
      await pool.query(q);
    }

    console.log(
      'Migration complete. You may optionally drop or null out flat columns.',
    );
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
