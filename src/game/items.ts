import { ITEM_TO_BLOCK, type ToolType } from '../world/blocks';

export interface ToolStats {
  type: ToolType;
  tier: number;
  /** Multiplier applied to mining speed. */
  speed: number;
  /** Damage dealt when swung at a creature. */
  damage: number;
  durability: number;
}

export interface ItemDef {
  id: string;
  name: string;
  stack: number;
  /** Block id placed when used (if any). */
  place?: number;
  tool?: ToolStats;
  /** Hunger restored when eaten. */
  food?: number;
  /** Credits earned when sold. */
  value: number;
  desc: string;
  /** True when the item can be equipped in the utility slot (mask, lantern...). */
  gear?: 'mask' | 'lantern' | 'scanner' | 'backpack' | 'thruster';
}

const defs = new Map<string, ItemDef>();

function item(d: ItemDef): void {
  defs.set(d.id, d);
}

/* ------------------------------- blocks ------------------------------- */
const blockItems: Array<[string, string, number, string]> = [
  ['stone', 'Stone', 64, 'A sturdy grey rock, quarried by the thousand.'],
  ['dirt', 'Dirt', 64, 'Soft and useless — mostly for building.'],
  ['grass_block', 'Grass Block', 64, 'The surface of the Sulfur Basin.'],
  ['sand', 'Sand', 64, 'Pale grains, warm to the touch.'],
  ['gravel', 'Gravel', 64, 'Loose stones, clattering when mined.'],
  ['cobblestone', 'Cobblestone', 64, 'Stone chunks, the miner staple.'],
  ['coal_ore', 'Coal Ore', 64, 'Black carbon seams.'],
  ['iron_ore', 'Iron Ore', 64, 'Rusty flecks in grey stone.'],
  ['gold_ore', 'Gold Ore', 64, 'A glint of precious metal.'],
  ['diamond_ore', 'Diamond Ore', 64, 'Ice-blue crystals, deep down.'],
  ['sulfur_ore', 'Sulfur Ore', 64, 'Brimstone yellow. The reason we came.'],
  ['sulfur_crystal_block', 'Sulfur Crystal', 64, 'A glowing chunk of pure sulfur.'],
  ['bedrock', 'Bedrock', 64, 'The bottom of the world. Nothing breaks it.'],
  ['log', 'Pine Log', 64, 'Scented resin wood from the ridge.'],
  ['leaves', 'Pine Needles', 64, 'Rustling green needles.'],
  ['planks', 'Planks', 64, 'Sawn pine boards.'],
  ['torch', 'Torch', 64, 'Light, warmth and a way home.'],
  ['glass', 'Glass', 64, 'Clear panels smelted from sulfur sand.'],
  ['bricks', 'Bricks', 64, 'Fired clay blocks for sturdy buildings.'],
  ['steel_block', 'Steel Block', 64, 'Industrial grade, machine strong.'],
  ['sulfur_brick', 'Sulfur Brick', 64, 'Golden blocks that soak up gas.'],
  ['charger', 'Charge Station', 16, 'Recharges BOLT-7 in the field.'],
  ['smelter', 'Smelter', 16, 'Turns raw ore into ingots.'],
  ['beacon', 'Beacon', 16, 'Marks your claim across the basin.'],
  ['lamp', 'Amber Lamp', 16, 'Bright, warm, battery free.'],
  ['ash', 'Ash', 64, 'Volcanic fallout.'],
  ['deepslate', 'Deepslate', 64, 'Stone from the deepest shafts.'],
  ['sulfur_sand', 'Sulfur Sand', 64, 'Sulphurous grains that melt into glass.'],
  ['fungus', 'Sulfur Fungus', 64, 'Glowing shelf fungus.'],
  ['crystal_shard', 'Crystal Shard', 64, 'A sharp crystal spike.'],
  ['mossy_stone', 'Mossy Stone', 64, 'Damp stone with a green coat.'],
  ['iron_block', 'Block of Iron', 64, 'Nine ingots pressed together.'],
  ['gold_block', 'Block of Gold', 64, 'Nine ingots pressed together.'],
  ['sulfur_block', 'Block of Sulfur', 64, 'Nine dust bales compressed.'],
];

for (const [id, name, stack, desc] of blockItems) {
  item({ id, name, stack, value: 0, desc, place: ITEM_TO_BLOCK.get(id) });
}

/* ----------------------------- materials ------------------------------ */
item({ id: 'coal', name: 'Coal', stack: 64, value: 6, desc: 'Fuel and a drawing tool.' });
item({ id: 'raw_iron', name: 'Raw Iron', stack: 64, value: 10, desc: 'Needs smelting.' });
item({ id: 'iron_ingot', name: 'Iron Ingot', stack: 64, value: 24, desc: 'Refined iron.' });
item({ id: 'raw_gold', name: 'Raw Gold', stack: 64, value: 22, desc: 'Needs smelting.' });
item({ id: 'gold_ingot', name: 'Gold Ingot', stack: 64, value: 44, desc: 'Refined gold.' });
item({ id: 'diamond', name: 'Diamond', stack: 64, value: 120, desc: 'A deep-shard jewel.' });
item({ id: 'sulfur_dust', name: 'Sulfur Dust', stack: 64, value: 7, desc: 'Yellow powder. Stings the eyes.' });
item({ id: 'sulfur_crystal', name: 'Sulfur Crystal', stack: 64, value: 90, desc: 'A faceted crystal of pure sulfur.' });
item({ id: 'steel_ingot', name: 'Steel Ingot', stack: 64, value: 60, desc: 'Iron and coal, fused.' });
item({ id: 'clay', name: 'Clay', stack: 64, value: 4, desc: 'Bakes into brick.' });
item({ id: 'stick', name: 'Stick', stack: 64, value: 1, desc: 'Tool handles and torch tips.' });

/* -------------------------------- gear -------------------------------- */
item({
  id: 'gas_mask',
  name: 'Gas Mask',
  stack: 1,
  value: 80,
  gear: 'mask',
  desc: 'Filters sulfur fumes. Equip in the utility slot.',
});
item({
  id: 'lantern',
  name: 'Lantern',
  stack: 1,
  value: 45,
  gear: 'lantern',
  desc: 'A handheld light. Press F to toggle.',
});
item({
  id: 'scanner',
  name: 'Ore Scanner',
  stack: 1,
  value: 70,
  gear: 'scanner',
  desc: 'Ping the rock for nearby ore veins.',
});
item({
  id: 'backpack',
  name: 'Miner Backpack',
  stack: 1,
  value: 90,
  gear: 'backpack',
  desc: 'Adds 27 slots to your pack.',
});
item({
  id: 'thruster',
  name: 'Thruster Pack',
  stack: 1,
  value: 160,
  gear: 'thruster',
  desc: 'Jet assist for a second jump.',
});
item({ id: 'battery_cell', name: 'Battery Cell', stack: 16, value: 55, desc: 'Charge for BOLT-7.' });
item({ id: 'beef', name: 'Grilled Ration', stack: 16, food: 6, value: 8, desc: 'Restores stamina and health.' });
item({ id: 'bread', name: 'Miners Bread', stack: 16, food: 4, value: 5, desc: 'Restores stamina.' });

/* -------------------------------- tools ------------------------------- */
item({
  id: 'pickaxe_wood',
  name: 'Wooden Pickaxe',
  stack: 1,
  value: 8,
  tool: { type: 'pickaxe', tier: 1, speed: 2.4, damage: 1, durability: 60 },
  desc: 'Barely better than your gloves.',
});
item({
  id: 'pickaxe_stone',
  name: 'Stone Pickaxe',
  stack: 1,
  value: 22,
  tool: { type: 'pickaxe', tier: 2, speed: 3.8, damage: 2, durability: 132 },
  desc: 'A reliable shaft of rock.',
});
item({
  id: 'pickaxe_iron',
  name: 'Iron Pickaxe',
  stack: 1,
  value: 60,
  tool: { type: 'pickaxe', tier: 3, speed: 5.2, damage: 3, durability: 250 },
  desc: 'Standard company issue.',
});
item({
  id: 'pickaxe_steel',
  name: 'Steel Pickaxe',
  stack: 1,
  value: 130,
  tool: { type: 'pickaxe', tier: 4, speed: 7.2, damage: 4, durability: 420 },
  desc: 'Heavy, precise, company grade.',
});
item({
  id: 'drill_sulfur',
  name: 'Sulfur Drill',
  stack: 1,
  value: 320,
  tool: { type: 'pickaxe', tier: 5, speed: 10.5, damage: 5, durability: 680 },
  desc: 'Rotary tungsten head. Eats brimstone.',
});
item({
  id: 'axe_iron',
  name: 'Iron Axe',
  stack: 1,
  value: 45,
  tool: { type: 'axe', tier: 3, speed: 4.6, damage: 4, durability: 220 },
  desc: 'Cuts logs and mushrooms alike.',
});
item({
  id: 'shovel_steel',
  name: 'Steel Shovel',
  stack: 1,
  value: 55,
  tool: { type: 'shovel', tier: 4, speed: 5.0, damage: 3, durability: 300 },
  desc: 'Digs through dirt and ash fast.',
});
item({
  id: 'sword_iron',
  name: 'Iron Sword',
  stack: 1,
  value: 70,
  tool: { type: 'sword', tier: 3, speed: 1.6, damage: 6, durability: 240 },
  desc: 'For the things that live in the dark.',
});

export function itemDef(id: string): ItemDef {
  const d = defs.get(id);
  if (d) return d;
  return { id, name: id.replace(/_/g, ' '), stack: 64, value: 0, desc: '' };
}

export function hasItem(id: string): boolean {
  return defs.has(id);
}

export function allItemIds(): string[] {
  return [...defs.keys()];
}

/** Tools that count as the given tool type. */
export function toolTier(id: string): number {
  return itemDef(id).tool?.tier ?? 0;
}

export function isTool(id: string): boolean {
  return itemDef(id).tool !== undefined;
}

export function isPlaceable(id: string): boolean {
  return itemDef(id).place !== undefined;
}
