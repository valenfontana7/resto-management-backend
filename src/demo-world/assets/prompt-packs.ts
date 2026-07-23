/**
 * Asset prompt packs — art direction + generation specs for flagship demos.
 * Generated files live in: /demo/photos/flagships/{slug}/
 */

export type FlagshipAssetKind =
  | 'logo'
  | 'hero'
  | 'interior'
  | 'dish'
  | 'drink'
  | 'dessert';

export interface FlagshipAssetSpec {
  file: string;
  kind: FlagshipAssetKind;
  /** Used by dishes that share this photo */
  usedBy: string[];
  prompt: string;
}

export interface FlagshipArtDirection {
  slug: string;
  name: string;
  artDirection: string;
  assets: FlagshipAssetSpec[];
}

const COMMON =
  'Photorealistic Argentine restaurant photography, no text, no watermark, no brand logos, shallow depth of field, natural color grading.';

export const LA_PARRILLA_ASSETS: FlagshipArtDirection = {
  slug: 'la-parrilla',
  name: 'Fuego de Palermo',
  artDirection:
    'Dark wood table, warm tungsten light, rustic ceramic plates, charcoal / asado mood, Palermo neighborhood grill.',
  assets: [
    {
      file: 'logo.png',
      kind: 'logo',
      usedBy: ['logo'],
      prompt:
        'Simple restaurant logo mark for fictional Argentine grill "Fuego de Palermo": stylized flame and grill fork icon, warm terracotta and charcoal colors, flat vector emblem on cream background, no text letters, no real brand.',
    },
    {
      file: 'hero.jpg',
      kind: 'hero',
      usedBy: ['hero', 'cover'],
      prompt: `${COMMON} Wide hero photo of Argentine asado on a charcoal grill at night, glowing embers, smoke, juicy cuts, inviting restaurant atmosphere.`,
    },
    {
      file: 'interior.jpg',
      kind: 'interior',
      usedBy: ['interior', 'about'],
      prompt: `${COMMON} Cozy Argentine parrilla dining room with small patio vibe, wooden tables, warm lamps, empty place settings, no people faces.`,
    },
    {
      file: 'bife-chorizo.jpg',
      kind: 'dish',
      usedBy: ['Bife de chorizo (400g)'],
      prompt: `${COMMON} Perfect medium-rare Argentine bife de chorizo steak on dark wood board, chimichurri on the side, warm restaurant light.`,
    },
    {
      file: 'provoleta.jpg',
      kind: 'dish',
      usedBy: ['Provoleta a la parrilla'],
      prompt: `${COMMON} Bubbling grilled provoleta cheese with oregano and chimichurri on a cast-iron plate, dark wood table.`,
    },
    {
      file: 'choripan.jpg',
      kind: 'dish',
      usedBy: ['Choripán de la casa'],
      prompt: `${COMMON} Argentine choripán on toasted rustic bread with chimichurri, dark wood table, warm light.`,
    },
    {
      file: 'empanadas.jpg',
      kind: 'dish',
      usedBy: ['Empanadas de carne (2 u.)'],
      prompt: `${COMMON} Two golden baked Argentine meat empanadas on a ceramic plate, dark wood table.`,
    },
    {
      file: 'entrana.jpg',
      kind: 'dish',
      usedBy: ['Entraña (350g)', 'Tira de asado (500g)'],
      prompt: `${COMMON} Juicy grilled entraña steak sliced, rustic plate, warm grill restaurant lighting.`,
    },
    {
      file: 'achuras.jpg',
      kind: 'dish',
      usedBy: ['Morcilla vasca', 'Chinchulines crocantes'],
      prompt: `${COMMON} Plate of Argentine achuras from the grill, crispy and appetizing, dark wood table.`,
    },
    {
      file: 'papas-rusticas.jpg',
      kind: 'dish',
      usedBy: ['Papas rústicas', 'Ensalada de la casa'],
      prompt: `${COMMON} Rustic roasted potato wedges with paprika on a ceramic bowl, dark wood table.`,
    },
    {
      file: 'milanesa.jpg',
      kind: 'dish',
      usedBy: ['Milanesa napolitana'],
      prompt: `${COMMON} Argentine milanesa napolitana with ham, mozzarella and tomato sauce, rustic plate, warm light.`,
    },
    {
      file: 'malbec.jpg',
      kind: 'drink',
      usedBy: ['Malbec copa', 'Agua con gas 500ml'],
      prompt: `${COMMON} Glass of Malbec wine on dark wood table in an Argentine parrilla, warm ambient light.`,
    },
    {
      file: 'flan.jpg',
      kind: 'dessert',
      usedBy: ['Flan casero con dulce de leche'],
      prompt: `${COMMON} Homemade flan with dulce de leche on a small plate, dark wood table, warm restaurant light.`,
    },
  ],
};

export const CAFE_CENTRAL_ASSETS: FlagshipArtDirection = {
  slug: 'cafe-central',
  name: 'Taller de Café San Telmo',
  artDirection:
    'Light marble or pale wood table, soft window daylight, matte ceramic cups, specialty coffee mood, San Telmo atelier.',
  assets: [
    {
      file: 'logo.png',
      kind: 'logo',
      usedBy: ['logo'],
      prompt:
        'Simple café logo mark for fictional "Taller de Café": coffee bean and cup silhouette, soft sage and warm brown, flat vector on cream paper texture, no letters, no real brand.',
    },
    {
      file: 'hero.jpg',
      kind: 'hero',
      usedBy: ['hero', 'cover'],
      prompt: `${COMMON} Specialty café counter with espresso machine steam, soft morning window light, inviting San Telmo coffee shop atmosphere.`,
    },
    {
      file: 'interior.jpg',
      kind: 'interior',
      usedBy: ['interior', 'about'],
      prompt: `${COMMON} Small specialty coffee shop interior, pale wood tables, plants, soft daylight from windows, empty seats, cozy atelier feel.`,
    },
    {
      file: 'flat-white.jpg',
      kind: 'dish',
      usedBy: ['Flat white'],
      prompt: `${COMMON} Perfect flat white coffee with microfoam latte art in a ceramic cup on pale marble table, soft window light.`,
    },
    {
      file: 'espresso.jpg',
      kind: 'dish',
      usedBy: ['Espresso', 'Filtro V60', 'Cold brew'],
      prompt: `${COMMON} Double espresso in a small ceramic cup on pale marble, soft daylight specialty café.`,
    },
    {
      file: 'medialuna.jpg',
      kind: 'dish',
      usedBy: ['Medialuna de manteca'],
      prompt: `${COMMON} Fresh Argentine medialuna croissant on a small plate, pale wood table, morning café light.`,
    },
    {
      file: 'cookie.jpg',
      kind: 'dish',
      usedBy: ['Cookie de chocolate', 'Budín de limón'],
      prompt: `${COMMON} Thick chocolate cookie with sea salt on ceramic plate, specialty café table, soft daylight.`,
    },
    {
      file: 'tostado.jpg',
      kind: 'dish',
      usedBy: ['Tostado completo', 'Avocado toast'],
      prompt: `${COMMON} Brunch toast with avocado, eggs and greens on pale ceramic plate, café window light.`,
    },
    {
      file: 'yogurt-bowl.jpg',
      kind: 'dish',
      usedBy: ['Bowl de yogurt y granola'],
      prompt: `${COMMON} Yogurt bowl with granola and fresh fruit, pale marble table, soft specialty café light.`,
    },
    {
      file: 'jugo.jpg',
      kind: 'drink',
      usedBy: ['Jugo exprimido naranja', 'Limonada casera'],
      prompt: `${COMMON} Fresh orange juice in a clear glass on café table, soft morning light.`,
    },
  ],
};

export const BURGER_LAB_ASSETS: FlagshipArtDirection = {
  slug: 'burger-lab',
  name: 'Carbón Burger Lab',
  artDirection:
    'Metal tray / dark slate, neon-adjacent warm night light, smash-burger joint energy, Nueva Córdoba casual.',
  assets: [
    {
      file: 'logo.png',
      kind: 'logo',
      usedBy: ['logo'],
      prompt:
        'Simple burger joint logo mark for fictional "Carbón Burger Lab": charcoal flame and burger silhouette, charcoal black and amber accent, flat vector on warm cream, no letters, no real brand.',
    },
    {
      file: 'hero.jpg',
      kind: 'hero',
      usedBy: ['hero', 'cover'],
      prompt: `${COMMON} Smash burger joint hero: double smash burger on metal tray with fries, warm night restaurant lighting, appetizing steam.`,
    },
    {
      file: 'interior.jpg',
      kind: 'interior',
      usedBy: ['interior', 'about'],
      prompt: `${COMMON} Casual burger bar interior, stools, warm amber lights, metal accents, empty tables, Nueva Córdoba night vibe.`,
    },
    {
      file: 'smash-clasica.jpg',
      kind: 'dish',
      usedBy: ['Smash Clásica'],
      prompt: `${COMMON} Double smash burger with melted cheddar and house sauce on brioche, metal tray, warm night light.`,
    },
    {
      file: 'smash-bacon.jpg',
      kind: 'dish',
      usedBy: ['Smash Bacon', 'Lab Picante'],
      prompt: `${COMMON} Smash burger with crispy bacon and cheddar on metal tray, warm burger joint lighting.`,
    },
    {
      file: 'veggie.jpg',
      kind: 'dish',
      usedBy: ['Veggie Smash'],
      prompt: `${COMMON} Vegetarian smash-style burger with greens and green sauce on brioche, metal tray, warm light.`,
    },
    {
      file: 'papas-carbon.jpg',
      kind: 'dish',
      usedBy: [
        'Papas Carbón',
        'Aros de cebolla',
        'Extra cheddar',
        'Extra bacon',
      ],
      prompt: `${COMMON} Thick-cut crispy fries with garlic dip in a metal basket, burger joint warm light.`,
    },
    {
      file: 'combo-lab.jpg',
      kind: 'dish',
      usedBy: ['Combo Lab', 'Combo Doble Noche'],
      prompt: `${COMMON} Burger combo on metal tray: smash burger, fries and soda, warm night restaurant light.`,
    },
    {
      file: 'birra.jpg',
      kind: 'drink',
      usedBy: ['Birra de barril 500ml', 'Gaseosa 500ml'],
      prompt: `${COMMON} Craft beer pint glass on dark bar top in a casual burger joint, warm amber light.`,
    },
    {
      file: 'brownie.jpg',
      kind: 'dessert',
      usedBy: ['Brownie con helado'],
      prompt: `${COMMON} Warm brownie with vanilla ice cream scoop on a small plate, burger restaurant dessert, warm light.`,
    },
  ],
};

export const PIZZA_ARTESANAL_ASSETS: FlagshipArtDirection = {
  slug: 'pizza-artesanal',
  name: 'Horno Villa Crespo',
  artDirection:
    'Warm wood peel and stone oven glow, flour-dusted pizza board, Buenos Aires neighborhood pizzeria, terracotta and cream.',
  assets: [
    {
      file: 'logo.png',
      kind: 'logo',
      usedBy: ['logo'],
      prompt:
        'Simple pizzeria logo mark for fictional "Horno Villa Crespo": wood-fired oven and pizza peel icon, terracotta and cream colors, flat vector emblem, no text letters, no real brand.',
    },
    {
      file: 'hero.jpg',
      kind: 'hero',
      usedBy: ['hero', 'cover'],
      prompt: `${COMMON} Hero photo of Argentine pizza coming out of a wood-fired stone oven, glowing embers, melted mozzarella, inviting pizzeria atmosphere.`,
    },
    {
      file: 'interior.jpg',
      kind: 'interior',
      usedBy: ['interior', 'about'],
      prompt: `${COMMON} Cozy Buenos Aires neighborhood pizzeria interior, wooden tables, stone oven visible in background, empty place settings, warm light, no people faces.`,
    },
    {
      file: 'mozzarella.jpg',
      kind: 'dish',
      usedBy: ['Mozzarella a la piedra'],
      prompt: `${COMMON} Classic Argentine mozzarella pizza on a wooden peel, golden crust, olives, warm oven light.`,
    },
    {
      file: 'napolitana.jpg',
      kind: 'dish',
      usedBy: ['Napolitana'],
      prompt: `${COMMON} Argentine napolitana pizza with tomato slices, garlic and oregano on wooden board, warm pizzeria light.`,
    },
    {
      file: 'fugazzeta.jpg',
      kind: 'dish',
      usedBy: ['Fugazzeta rellena'],
      prompt: `${COMMON} Thick Argentine fugazzeta pizza loaded with white onion and melted mozzarella, wooden board, warm light.`,
    },
    {
      file: 'provolone.jpg',
      kind: 'dish',
      usedBy: ['Provolone y rúcula'],
      prompt: `${COMMON} Pizza with melted provolone and fresh arugula on top, wooden peel, warm restaurant light.`,
    },
    {
      file: 'calabresa.jpg',
      kind: 'dish',
      usedBy: ['Calabresa'],
      prompt: `${COMMON} Calabresa pizza with spicy sausage slices and mozzarella, golden crust, warm oven light.`,
    },
    {
      file: 'empanadas.jpg',
      kind: 'dish',
      usedBy: [
        'Empanadas de carne (media docena)',
        'Empanadas jamón y queso (media docena)',
      ],
      prompt: `${COMMON} Half dozen golden baked Argentine empanadas on a ceramic plate, warm wood table.`,
    },
    {
      file: 'faina.jpg',
      kind: 'dish',
      usedBy: ['Fainá', 'Ensalada mixta'],
      prompt: `${COMMON} Slice of Argentine fainá chickpea flatbread on a small plate next to pizza vibe, warm light.`,
    },
    {
      file: 'gaseosa.jpg',
      kind: 'drink',
      usedBy: ['Gaseosa 1.5L'],
      prompt: `${COMMON} Condensation soda bottle on a wooden pizzeria table, no brand labels visible, warm light.`,
    },
    {
      file: 'birra.jpg',
      kind: 'drink',
      usedBy: ['Cerveza artesanal 473ml'],
      prompt: `${COMMON} Craft beer can or pint on wooden pizzeria table, no brand logos, warm ambient light.`,
    },
    {
      file: 'flan.jpg',
      kind: 'dessert',
      usedBy: ['Flan casero'],
      prompt: `${COMMON} Homemade flan with dulce de leche on a small plate, Argentine dessert, warm restaurant light.`,
    },
  ],
};

export const SUSHI_EXPRESS_ASSETS: FlagshipArtDirection = {
  slug: 'sushi-express',
  name: 'Kaito Centro',
  artDirection:
    'Clean slate / light wood sushi bar, cool daylight and soft accent light, Rosario Japanese-fusion, minimal plating.',
  assets: [
    {
      file: 'logo.png',
      kind: 'logo',
      usedBy: ['logo'],
      prompt:
        'Simple sushi restaurant logo mark for fictional "Kaito Centro": stylized fish and chopsticks icon, deep teal and soft coral, flat vector on light background, no text letters, no real brand.',
    },
    {
      file: 'hero.jpg',
      kind: 'hero',
      usedBy: ['hero', 'cover'],
      prompt: `${COMMON} Hero sushi platter: colorful rolls and sashimi on slate, fresh fish, clean restaurant lighting, appetizing.`,
    },
    {
      file: 'interior.jpg',
      kind: 'interior',
      usedBy: ['interior', 'about'],
      prompt: `${COMMON} Minimal sushi bar interior with light wood, clean counter, empty stools, soft daylight, no people faces.`,
    },
    {
      file: 'philadelphia.jpg',
      kind: 'dish',
      usedBy: ['Philadelphia roll'],
      prompt: `${COMMON} Philadelphia sushi roll with salmon, cream cheese and avocado on slate plate, clean light.`,
    },
    {
      file: 'spicy-tuna.jpg',
      kind: 'dish',
      usedBy: ['Spicy tuna'],
      prompt: `${COMMON} Spicy tuna sushi roll with sesame on slate, clean restaurant light.`,
    },
    {
      file: 'california.jpg',
      kind: 'dish',
      usedBy: ['California roll'],
      prompt: `${COMMON} California sushi roll with avocado and cucumber on slate plate, clean light.`,
    },
    {
      file: 'salmon-avo.jpg',
      kind: 'dish',
      usedBy: ['Salmon avocado'],
      prompt: `${COMMON} Salmon avocado sushi roll on slate, fresh fish, clean daylight.`,
    },
    {
      file: 'sashimi.jpg',
      kind: 'dish',
      usedBy: ['Sashimi mix 12 pzas', 'Sashimi salmón 8 pzas'],
      prompt: `${COMMON} Mixed sashimi plate salmon tuna white fish on slate with garnish, clean light.`,
    },
    {
      file: 'nigiri.jpg',
      kind: 'dish',
      usedBy: ['Nigiri combo'],
      prompt: `${COMMON} Assorted nigiri sushi pieces on a wooden board, clean restaurant lighting.`,
    },
    {
      file: 'edamame.jpg',
      kind: 'dish',
      usedBy: ['Edamame'],
      prompt: `${COMMON} Bowl of salted edamame on light wood table, sushi restaurant appetizer, clean light.`,
    },
    {
      file: 'gyozas.jpg',
      kind: 'dish',
      usedBy: ['Gyozas (6 u.)'],
      prompt: `${COMMON} Six pan-seared gyozas on a plate with dipping sauce, sushi restaurant, clean light.`,
    },
    {
      file: 'agua.jpg',
      kind: 'drink',
      usedBy: ['Agua mineral 500ml'],
      prompt: `${COMMON} Clear mineral water bottle on light wood sushi bar table, no brand logo, soft light.`,
    },
    {
      file: 'te-verde.jpg',
      kind: 'drink',
      usedBy: ['Té verde frío'],
      prompt: `${COMMON} Cold green tea in a clear glass on light wood table, sushi restaurant, soft daylight.`,
    },
    {
      file: 'mochi.jpg',
      kind: 'dessert',
      usedBy: ['Mochi de té matcha'],
      prompt: `${COMMON} Two matcha mochi desserts on a small plate, Japanese restaurant dessert, clean soft light.`,
    },
  ],
};

export const FLAGSHIP_ASSET_PACKS: FlagshipArtDirection[] = [
  LA_PARRILLA_ASSETS,
  CAFE_CENTRAL_ASSETS,
  BURGER_LAB_ASSETS,
  PIZZA_ARTESANAL_ASSETS,
  SUSHI_EXPRESS_ASSETS,
];
