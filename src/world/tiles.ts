/**
 * Texture tile registry.
 * The atlas is a 16x16 grid of 16px tiles; the index of a tile is its
 * position in this ordered list. `textures.ts` paints one pixel-art tile per
 * entry, `blocks.ts` references tiles by name so the art can be re-skinned
 * without touching gameplay code.
 */

export const TILE_NAMES = [
  'stone',
  'dirt',
  'grass_top',
  'grass_side',
  'sand',
  'gravel',
  'cobblestone',
  'coal_ore',
  'iron_ore',
  'gold_ore',
  'diamond_ore',
  'sulfur_ore',
  'sulfur_crystal',
  'lava',
  'water',
  'bedrock',
  'log_side',
  'log_top',
  'leaves',
  'planks',
  'torch',
  'glass',
  'brick',
  'steel_block',
  'sulfur_brick',
  'charger',
  'smelter',
  'beacon',
  'lamp',
  'ash',
  'deepslate',
  'sulfur_sand',
  'fungus',
  'crystal_shard',
  'mossy_stone',
  'iron_block',
  'gold_block',
  'sulfur_block',
  'crack_0',
  'crack_1',
  'crack_2',
  'crack_3',
  'crack_4',
  'crack_5',
  'crack_6',
  'crack_7',
  'crack_8',
  'crack_9',
] as const;

export type TileName = (typeof TILE_NAMES)[number];

export const TILE: Record<TileName, number> = TILE_NAMES.reduce(
  (acc, name, i) => {
    acc[name] = i;
    return acc;
  },
  {} as Record<TileName, number>,
);

export const ATLAS_COLS = 16;
export const ATLAS_ROWS = Math.ceil(TILE_NAMES.length / ATLAS_COLS);
export const TILE_PX = 16;

/** First crack overlay tile (10 destruction stages). */
export const CRACK_BASE = TILE.crack_0;
export const CRACK_STAGES = 10;
