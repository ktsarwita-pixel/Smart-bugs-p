export interface RecipeIngredient {
  item: string;
  count: number;
}

export interface Recipe {
  id: string;
  output: { item: string; count: number };
  ingredients: RecipeIngredient[];
  /** Crafting station required (none = hand crafting). */
  station?: 'smelter';
  desc: string;
}

const recipes: Recipe[] = [];
let counter = 0;

function recipe(
  output: string,
  count: number,
  ingredients: RecipeIngredient[],
  desc: string,
  station?: 'smelter',
): void {
  recipes.push({
    id: `r${counter++}`,
    output: { item: output, count },
    ingredients,
    desc,
    station,
  });
}

recipe('planks', 4, [{ item: 'log', count: 1 }], 'Saw a log into four planks.');
recipe('stick', 4, [{ item: 'planks', count: 2 }], 'Split planks into sticks.');
recipe(
  'torch',
  4,
  [
    { item: 'coal', count: 1 },
    { item: 'stick', count: 1 },
  ],
  'Light the shaft.',
);
recipe(
  'pickaxe_wood',
  1,
  [
    { item: 'planks', count: 3 },
    { item: 'stick', count: 2 },
  ],
  'Your first real tool.',
);
recipe(
  'pickaxe_stone',
  1,
  [
    { item: 'cobblestone', count: 3 },
    { item: 'stick', count: 2 },
  ],
  'Hits stone twice as fast.',
);
recipe(
  'pickaxe_iron',
  1,
  [
    { item: 'iron_ingot', count: 3 },
    { item: 'stick', count: 2 },
  ],
  'Company standard pick.',
);
recipe(
  'pickaxe_steel',
  1,
  [
    { item: 'steel_ingot', count: 3 },
    { item: 'stick', count: 2 },
  ],
  'For hard rock.',
);
recipe(
  'drill_sulfur',
  1,
  [
    { item: 'iron_ingot', count: 2 },
    { item: 'sulfur_crystal', count: 1 },
    { item: 'battery_cell', count: 1 },
  ],
  'Tungsten drill for sulfur seams.',
);
recipe(
  'axe_iron',
  1,
  [
    { item: 'iron_ingot', count: 3 },
    { item: 'stick', count: 2 },
  ],
  'Chops wood fast.',
);
recipe(
  'shovel_steel',
  1,
  [
    { item: 'steel_ingot', count: 1 },
    { item: 'stick', count: 2 },
  ],
  'Moves dirt and ash.',
);
recipe(
  'sword_iron',
  1,
  [
    { item: 'iron_ingot', count: 2 },
    { item: 'stick', count: 1 },
  ],
  'Keeps the dark at arm’s length.',
);
recipe('iron_ingot', 1, [{ item: 'raw_iron', count: 1 }], 'Smelt raw iron.', 'smelter');
recipe('gold_ingot', 1, [{ item: 'raw_gold', count: 1 }], 'Smelt raw gold.', 'smelter');
recipe(
  'steel_ingot',
  1,
  [
    { item: 'iron_ingot', count: 1 },
    { item: 'coal', count: 1 },
  ],
  'Fuse iron with carbon.',
  'smelter',
);
recipe('glass', 1, [{ item: 'sulfur_sand', count: 1 }], 'Melt sulfur sand.', 'smelter');
recipe('bricks', 1, [{ item: 'stone', count: 4 }], 'Fire bricks.', 'smelter');
recipe(
  'sulfur_brick',
  1,
  [
    { item: 'sulfur_dust', count: 4 },
    { item: 'coal', count: 1 },
  ],
  'Blocks that absorb fumes.',
  'smelter',
);
recipe('iron_block', 1, [{ item: 'iron_ingot', count: 9 }], 'Compress nine ingots.');
recipe('gold_block', 1, [{ item: 'gold_ingot', count: 9 }], 'Compress nine ingots.');
recipe('sulfur_block', 1, [{ item: 'sulfur_dust', count: 9 }], 'Compress nine bales.');
recipe(
  'battery_cell',
  1,
  [
    { item: 'iron_ingot', count: 1 },
    { item: 'sulfur_crystal', count: 1 },
    { item: 'coal', count: 2 },
  ],
  'Charge for BOLT-7.',
);
recipe(
  'gas_mask',
  1,
  [
    { item: 'sulfur_dust', count: 2 },
    { item: 'iron_ingot', count: 1 },
    { item: 'glass', count: 1 },
  ],
  'Breath through the fumes.',
);
recipe(
  'lantern',
  1,
  [
    { item: 'iron_ingot', count: 1 },
    { item: 'sulfur_dust', count: 1 },
    { item: 'glass', count: 1 },
  ],
  'A light you can carry.',
);
recipe(
  'scanner',
  1,
  [
    { item: 'iron_ingot', count: 1 },
    { item: 'glass', count: 1 },
    { item: 'sulfur_crystal', count: 1 },
  ],
  'Ping for ore veins.',
);
recipe(
  'backpack',
  1,
  [
    { item: 'sulfur_dust', count: 4 },
    { item: 'iron_ingot', count: 2 },
  ],
  '27 extra slots.',
);
recipe(
  'thruster',
  1,
  [
    { item: 'steel_ingot', count: 2 },
    { item: 'battery_cell', count: 1 },
    { item: 'sulfur_crystal', count: 2 },
  ],
  'Jump twice, once.',
);
recipe(
  'charger',
  1,
  [
    { item: 'iron_ingot', count: 4 },
    { item: 'steel_ingot', count: 2 },
    { item: 'battery_cell', count: 1 },
  ],
  'A field charge station for BOLT-7.',
);
recipe(
  'smelter',
  1,
  [
    { item: 'cobblestone', count: 8 },
    { item: 'iron_ingot', count: 1 },
  ],
  'Ore to ingots.',
);
recipe(
  'beacon',
  1,
  [
    { item: 'sulfur_crystal', count: 4 },
    { item: 'iron_ingot', count: 2 },
    { item: 'diamond', count: 1 },
  ],
  'Claim marker and robot recall link.',
);
recipe(
  'lamp',
  1,
  [
    { item: 'iron_ingot', count: 1 },
    { item: 'sulfur_dust', count: 1 },
    { item: 'glass', count: 1 },
  ],
  'A permanent light.',
);

export function allRecipes(): Recipe[] {
  return recipes;
}

export function findRecipesFor(itemId: string): Recipe[] {
  return recipes.filter((r) => r.output.item === itemId);
}
