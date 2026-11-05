import { TILE } from './tiles';

export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'none';
export type SoundKind =
  | 'stone'
  | 'dirt'
  | 'grass'
  | 'sand'
  | 'wood'
  | 'glass'
  | 'metal'
  | 'ore'
  | 'plant'
  | 'liquid';
export type RenderKind = 'cube' | 'cross' | 'liquid' | 'torch';

export interface BlockDef {
  id: number;
  name: string;
  /** Texture tiles for the six faces. */
  top: number;
  bottom: number;
  side: number;
  /** Seconds to break with bare hands (scaled by tool speed). */
  hardness: number;
  tool: ToolType;
  /** Minimum tool tier required for the block to drop anything. */
  tier: number;
  /** Light emitted, 0-15. */
  light: number;
  /** Collides with entities. */
  solid: boolean;
  /** Blocks light / hides neighbouring faces. */
  opaque: boolean;
  render: RenderKind;
  /** Item id dropped when mined (defaults to the block's own item). */
  drop: string;
  dropCount: number;
  /** Damage/hazard applied on contact. */
  hazard: 'lava' | 'toxic' | null;
  sound: SoundKind;
  /** Credits when sold. */
  value: number;
  /** Experience-like points granted to contracts. */
  /** Rendered in the liquid/cross passes when true. */
  cutout: boolean;
  /** Liquid blocks are non-solid but swimmable. */
  liquid: boolean;
}

export const Block = {
  AIR: 0,
  STONE: 1,
  DIRT: 2,
  GRASS: 3,
  SAND: 4,
  GRAVEL: 5,
  COBBLESTONE: 6,
  COAL_ORE: 7,
  IRON_ORE: 8,
  GOLD_ORE: 9,
  DIAMOND_ORE: 10,
  SULFUR_ORE: 11,
  SULFUR_CRYSTAL: 12,
  LAVA: 13,
  WATER: 14,
  BEDROCK: 15,
  LOG: 16,
  LEAVES: 17,
  PLANK: 18,
  TORCH: 19,
  GLASS: 20,
  BRICK: 21,
  STEEL_BLOCK: 22,
  SULFUR_BRICK: 23,
  CHARGER: 24,
  SMELTER: 25,
  BEACON: 26,
  LAMP: 27,
  ASH: 28,
  DEEPSLATE: 29,
  SULFUR_SAND: 30,
  FUNGUS: 31,
  CRYSTAL_SHARD: 32,
  MOSSY_STONE: 33,
  IRON_BLOCK: 34,
  GOLD_BLOCK: 35,
  SULFUR_BLOCK: 36,
} as const;

export type BlockId = number;

const defs: BlockDef[] = [];

function def(d: Partial<BlockDef> & { id: number; name: string }): BlockDef {
  const full: BlockDef = {
    top: TILE.stone,
    bottom: TILE.stone,
    side: TILE.stone,
    hardness: 1,
    tool: 'none',
    tier: 0,
    light: 0,
    solid: true,
    opaque: true,
    render: 'cube',
    drop: '',
    dropCount: 1,
    hazard: null,
    sound: 'stone',
    value: 0,
    cutout: false,
    liquid: false,
    ...d,
  };
  full.drop = full.drop || d.name;
  defs[full.id] = full;
  return full;
}

def({ id: Block.AIR, name: 'Air', top: TILE.stone, bottom: TILE.stone, side: TILE.stone, solid: false, opaque: false, hardness: 0, render: 'cube', drop: '' });

def({
  id: Block.STONE,
  name: 'Stone',
  top: TILE.stone,
  bottom: TILE.stone,
  side: TILE.stone,
  hardness: 1.5,
  tool: 'pickaxe',
  tier: 1,
  drop: 'cobblestone',
  sound: 'stone',
  value: 1,
});
def({
  id: Block.DIRT,
  name: 'Dirt',
  top: TILE.dirt,
  bottom: TILE.dirt,
  side: TILE.dirt,
  hardness: 0.5,
  tool: 'shovel',
  sound: 'dirt',
  value: 1,
});
def({
  id: Block.GRASS,
  name: 'Grass Block',
  top: TILE.grass_top,
  bottom: TILE.dirt,
  side: TILE.grass_side,
  hardness: 0.6,
  tool: 'shovel',
  drop: 'dirt',
  sound: 'grass',
  value: 1,
});
def({
  id: Block.SAND,
  name: 'Sand',
  top: TILE.sand,
  bottom: TILE.sand,
  side: TILE.sand,
  hardness: 0.5,
  tool: 'shovel',
  sound: 'sand',
  value: 1,
});
def({
  id: Block.GRAVEL,
  name: 'Gravel',
  top: TILE.gravel,
  bottom: TILE.gravel,
  side: TILE.gravel,
  hardness: 0.6,
  tool: 'shovel',
  sound: 'sand',
  value: 1,
});
def({
  id: Block.COBBLESTONE,
  name: 'Cobblestone',
  top: TILE.cobblestone,
  bottom: TILE.cobblestone,
  side: TILE.cobblestone,
  hardness: 1.8,
  tool: 'pickaxe',
  tier: 1,
  sound: 'stone',
  value: 2,
});
def({
  id: Block.COAL_ORE,
  name: 'Coal Ore',
  top: TILE.coal_ore,
  bottom: TILE.coal_ore,
  side: TILE.coal_ore,
  hardness: 2.4,
  tool: 'pickaxe',
  tier: 1,
  drop: 'coal',
  sound: 'ore',
  value: 6,
});
def({
  id: Block.IRON_ORE,
  name: 'Iron Ore',
  top: TILE.iron_ore,
  bottom: TILE.iron_ore,
  side: TILE.iron_ore,
  hardness: 2.9,
  tool: 'pickaxe',
  tier: 2,
  drop: 'raw_iron',
  sound: 'ore',
  value: 12,
});
def({
  id: Block.GOLD_ORE,
  name: 'Gold Ore',
  top: TILE.gold_ore,
  bottom: TILE.gold_ore,
  side: TILE.gold_ore,
  hardness: 3.4,
  tool: 'pickaxe',
  tier: 3,
  drop: 'raw_gold',
  sound: 'ore',
  value: 26,
});
def({
  id: Block.DIAMOND_ORE,
  name: 'Diamond Ore',
  top: TILE.diamond_ore,
  bottom: TILE.diamond_ore,
  side: TILE.diamond_ore,
  hardness: 4.2,
  tool: 'pickaxe',
  tier: 3,
  drop: 'diamond',
  sound: 'ore',
  value: 70,
});
def({
  id: Block.SULFUR_ORE,
  name: 'Sulfur Ore',
  top: TILE.sulfur_ore,
  bottom: TILE.sulfur_ore,
  side: TILE.sulfur_ore,
  hardness: 2.6,
  tool: 'pickaxe',
  tier: 2,
  drop: 'sulfur_dust',
  dropCount: 2,
  sound: 'ore',
  value: 9,
});
def({
  id: Block.SULFUR_CRYSTAL,
  name: 'Sulfur Crystal',
  top: TILE.sulfur_crystal,
  bottom: TILE.sulfur_crystal,
  side: TILE.sulfur_crystal,
  hardness: 3.6,
  tool: 'pickaxe',
  tier: 3,
  drop: 'sulfur_crystal',
  sound: 'glass',
  value: 120,
  light: 6,
});
def({
  id: Block.LAVA,
  name: 'Lava',
  top: TILE.lava,
  bottom: TILE.lava,
  side: TILE.lava,
  hardness: 4,
  tool: 'pickaxe',
  tier: 4,
  solid: false,
  opaque: false,
  liquid: true,
  render: 'liquid',
  light: 15,
  hazard: 'lava',
  drop: '',
  sound: 'liquid',
});
def({
  id: Block.WATER,
  name: 'Water',
  top: TILE.water,
  bottom: TILE.water,
  side: TILE.water,
  hardness: 4,
  tool: 'none',
  solid: false,
  opaque: false,
  liquid: true,
  render: 'liquid',
  drop: '',
  sound: 'liquid',
});
def({
  id: Block.BEDROCK,
  name: 'Bedrock',
  top: TILE.bedrock,
  bottom: TILE.bedrock,
  side: TILE.bedrock,
  hardness: 12,
  tool: 'pickaxe',
  tier: 5,
  drop: '',
  sound: 'stone',
});
def({
  id: Block.LOG,
  name: 'Pine Log',
  top: TILE.log_top,
  bottom: TILE.log_top,
  side: TILE.log_side,
  hardness: 1.6,
  tool: 'axe',
  sound: 'wood',
  value: 3,
});
def({
  id: Block.LEAVES,
  name: 'Pine Needles',
  top: TILE.leaves,
  bottom: TILE.leaves,
  side: TILE.leaves,
  hardness: 0.3,
  tool: 'none',
  opaque: false,
  cutout: true,
  drop: '',
  sound: 'plant',
});
def({
  id: Block.PLANK,
  name: 'Planks',
  top: TILE.planks,
  bottom: TILE.planks,
  side: TILE.planks,
  hardness: 1.4,
  tool: 'axe',
  sound: 'wood',
  value: 3,
});
def({
  id: Block.TORCH,
  name: 'Torch',
  top: TILE.torch,
  bottom: TILE.torch,
  side: TILE.torch,
  hardness: 0.1,
  tool: 'none',
  solid: false,
  opaque: false,
  cutout: true,
  render: 'torch',
  light: 14,
  sound: 'wood',
  value: 2,
});
def({
  id: Block.GLASS,
  name: 'Glass',
  top: TILE.glass,
  bottom: TILE.glass,
  side: TILE.glass,
  hardness: 0.4,
  tool: 'none',
  opaque: false,
  cutout: true,
  sound: 'glass',
  value: 4,
});
def({
  id: Block.BRICK,
  name: 'Bricks',
  top: TILE.brick,
  bottom: TILE.brick,
  side: TILE.brick,
  hardness: 2.2,
  tool: 'pickaxe',
  tier: 1,
  sound: 'stone',
  value: 5,
});
def({
  id: Block.STEEL_BLOCK,
  name: 'Steel Block',
  top: TILE.steel_block,
  bottom: TILE.steel_block,
  side: TILE.steel_block,
  hardness: 3.6,
  tool: 'pickaxe',
  tier: 2,
  sound: 'metal',
  value: 24,
});
def({
  id: Block.SULFUR_BRICK,
  name: 'Sulfur Brick',
  top: TILE.sulfur_brick,
  bottom: TILE.sulfur_brick,
  side: TILE.sulfur_brick,
  hardness: 2.4,
  tool: 'pickaxe',
  tier: 2,
  sound: 'stone',
  value: 16,
});
def({
  id: Block.CHARGER,
  name: 'Charge Station',
  top: TILE.charger,
  bottom: TILE.charger,
  side: TILE.charger,
  hardness: 3.2,
  tool: 'pickaxe',
  tier: 2,
  light: 7,
  sound: 'metal',
  value: 90,
});
def({
  id: Block.SMELTER,
  name: 'Smelter',
  top: TILE.smelter,
  bottom: TILE.smelter,
  side: TILE.smelter,
  hardness: 3.2,
  tool: 'pickaxe',
  tier: 2,
  light: 9,
  sound: 'metal',
  value: 120,
});
def({
  id: Block.BEACON,
  name: 'Beacon',
  top: TILE.beacon,
  bottom: TILE.beacon,
  side: TILE.beacon,
  hardness: 3.2,
  tool: 'pickaxe',
  tier: 2,
  light: 12,
  sound: 'metal',
  value: 160,
});
def({
  id: Block.LAMP,
  name: 'Amber Lamp',
  top: TILE.lamp,
  bottom: TILE.lamp,
  side: TILE.lamp,
  hardness: 0.6,
  tool: 'none',
  light: 15,
  sound: 'glass',
  value: 25,
});
def({
  id: Block.ASH,
  name: 'Ash',
  top: TILE.ash,
  bottom: TILE.ash,
  side: TILE.ash,
  hardness: 0.5,
  tool: 'shovel',
  sound: 'sand',
  value: 1,
});
def({
  id: Block.DEEPSLATE,
  name: 'Deepslate',
  top: TILE.deepslate,
  bottom: TILE.deepslate,
  side: TILE.deepslate,
  hardness: 2.6,
  tool: 'pickaxe',
  tier: 2,
  drop: 'cobblestone',
  sound: 'stone',
  value: 2,
});
def({
  id: Block.SULFUR_SAND,
  name: 'Sulfur Sand',
  top: TILE.sulfur_sand,
  bottom: TILE.sulfur_sand,
  side: TILE.sulfur_sand,
  hardness: 0.5,
  tool: 'shovel',
  sound: 'sand',
  value: 2,
});
def({
  id: Block.FUNGUS,
  name: 'Sulfur Fungus',
  top: TILE.fungus,
  bottom: TILE.fungus,
  side: TILE.fungus,
  hardness: 0.2,
  tool: 'none',
  solid: false,
  opaque: false,
  cutout: true,
  render: 'cross',
  light: 3,
  drop: '',
  sound: 'plant',
});
def({
  id: Block.CRYSTAL_SHARD,
  name: 'Crystal Shard',
  top: TILE.crystal_shard,
  bottom: TILE.crystal_shard,
  side: TILE.crystal_shard,
  hardness: 0.6,
  tool: 'pickaxe',
  tier: 2,
  solid: false,
  opaque: false,
  cutout: true,
  render: 'cross',
  light: 8,
  drop: 'sulfur_crystal',
  sound: 'glass',
  value: 60,
});
def({
  id: Block.MOSSY_STONE,
  name: 'Mossy Stone',
  top: TILE.mossy_stone,
  bottom: TILE.mossy_stone,
  side: TILE.mossy_stone,
  hardness: 1.6,
  tool: 'pickaxe',
  tier: 1,
  sound: 'stone',
  value: 2,
});
def({
  id: Block.IRON_BLOCK,
  name: 'Block of Iron',
  top: TILE.iron_block,
  bottom: TILE.iron_block,
  side: TILE.iron_block,
  hardness: 4,
  tool: 'pickaxe',
  tier: 3,
  sound: 'metal',
  value: 120,
});
def({
  id: Block.GOLD_BLOCK,
  name: 'Block of Gold',
  top: TILE.gold_block,
  bottom: TILE.gold_block,
  side: TILE.gold_block,
  hardness: 3.4,
  tool: 'pickaxe',
  tier: 3,
  sound: 'metal',
  value: 180,
});
def({
  id: Block.SULFUR_BLOCK,
  name: 'Block of Sulfur',
  top: TILE.sulfur_block,
  bottom: TILE.sulfur_block,
  side: TILE.sulfur_block,
  hardness: 2.6,
  tool: 'pickaxe',
  tier: 2,
  light: 4,
  sound: 'stone',
  value: 90,
});

/** Dense lookup table: block id -> definition. */
export const BLOCKS: BlockDef[] = defs;

export function blockDef(id: BlockId): BlockDef {
  return defs[id] ?? defs[Block.AIR];
}

export function isSolid(id: BlockId): boolean {
  return blockDef(id).solid;
}

export function isOpaque(id: BlockId): boolean {
  return blockDef(id).opaque;
}

export function isLiquid(id: BlockId): boolean {
  return blockDef(id).liquid;
}

export function lightEmission(id: BlockId): number {
  return blockDef(id).light;
}

/** Blocks that can be mined for a resource (used by the robot scanner). */
export function isValuable(id: BlockId): boolean {
  const d = blockDef(id);
  return (
    d.value >= 5 ||
    id === Block.SULFUR_ORE ||
    id === Block.SULFUR_CRYSTAL ||
    id === Block.CRYSTAL_SHARD
  );
}

/** Item id -> block id for every placeable block. */
export const ITEM_TO_BLOCK = new Map<string, number>([
  ['stone', Block.STONE],
  ['dirt', Block.DIRT],
  ['grass_block', Block.GRASS],
  ['sand', Block.SAND],
  ['gravel', Block.GRAVEL],
  ['cobblestone', Block.COBBLESTONE],
  ['coal_ore', Block.COAL_ORE],
  ['iron_ore', Block.IRON_ORE],
  ['gold_ore', Block.GOLD_ORE],
  ['diamond_ore', Block.DIAMOND_ORE],
  ['sulfur_ore', Block.SULFUR_ORE],
  ['sulfur_crystal_block', Block.SULFUR_CRYSTAL],
  ['bedrock', Block.BEDROCK],
  ['log', Block.LOG],
  ['leaves', Block.LEAVES],
  ['planks', Block.PLANK],
  ['torch', Block.TORCH],
  ['glass', Block.GLASS],
  ['bricks', Block.BRICK],
  ['steel_block', Block.STEEL_BLOCK],
  ['sulfur_brick', Block.SULFUR_BRICK],
  ['charger', Block.CHARGER],
  ['smelter', Block.SMELTER],
  ['beacon', Block.BEACON],
  ['lamp', Block.LAMP],
  ['ash', Block.ASH],
  ['deepslate', Block.DEEPSLATE],
  ['sulfur_sand', Block.SULFUR_SAND],
  ['fungus', Block.FUNGUS],
  ['crystal_shard', Block.CRYSTAL_SHARD],
  ['mossy_stone', Block.MOSSY_STONE],
  ['iron_block', Block.IRON_BLOCK],
  ['gold_block', Block.GOLD_BLOCK],
  ['sulfur_block', Block.SULFUR_BLOCK],
]);
