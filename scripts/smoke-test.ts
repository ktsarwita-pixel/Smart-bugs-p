/**
 * Headless smoke tests for the engine (no browser required).
 * Run with: npm run test
 */
import { World } from '../src/world/world';
import { Block, blockDef, ITEM_TO_BLOCK } from '../src/world/blocks';
import { Inventory } from '../src/game/inventory';
import { itemDef, hasItem } from '../src/game/items';
import { allRecipes } from '../src/game/recipes';
import { UPGRADES } from '../src/game/upgrades';
import { QUESTS, Stats } from '../src/game/quests';
import { WORLD_X, WORLD_Y, WORLD_Z } from '../src/core/constants';

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, extra = ''): void {
  checks++;
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ */
section('World generation');
const world = new World(12345);

let solid = 0;
let ores = 0;
for (let i = 0; i < world.blocks.length; i++) {
  const b = world.blocks[i];
  if (b !== Block.AIR) solid++;
  const d = blockDef(b);
  if (d.value >= 6 && d.drop !== 'coal' && d.drop !== 'raw_iron') ores++;
}
check('world has solid blocks', solid > 100000, `solid=${solid}`);
check('world contains ore blocks', ores > 100, `ores=${ores}`);
check('spawn is above ground', world.terrain.spawn.y > 10, `y=${world.terrain.spawn.y}`);
check(
  'spawn column is not solid',
  world.getBlock(Math.floor(world.terrain.spawn.x), Math.floor(world.terrain.spawn.y), Math.floor(world.terrain.spawn.z)) ===
    Block.AIR,
);
check('home shaft is carved', world.getBlock(64, 20, 64) === Block.AIR, 'shaft centre should be air');

/* ------------------------------------------------------------------ */
section('Lighting engine');
const surfaceY = world.terrain.heightMap[64 * 1 + 64 * WORLD_X];
check('sky light reaches the surface', world.skyLightAt(64, surfaceY + 1, 64) > 10, `sky=${world.skyLightAt(64, surfaceY + 1, 64)}`);
check('deep rock is dark', world.lightAt(64, 6, 64) <= 4, `light=${world.lightAt(64, 6, 64)}`);

// Carve a pocket in the dark and drop a torch in it.
const tx = 64;
const ty = 6;
const tz = 64;
for (let dy = -1; dy <= 1; dy++) {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) world.setBlock(tx + dx, ty + dy, tz + dz, Block.AIR);
  }
}
world.setBlock(tx, ty, tz, Block.TORCH);
check('torch emits light', world.blockLight[(ty * WORLD_Z + tz) * WORLD_X + tx] === 14);
check('torch light spreads to neighbours', world.lightAt(tx + 1, ty, tz) > 0, `light=${world.lightAt(tx + 1, ty, tz)}`);
check('torch light falls off with distance', world.lightAt(tx + 1, ty, tz) < 14);

world.setBlock(tx, ty, tz, Block.AIR);
check(
  'removing the torch removes its light',
  world.lightAt(tx + 1, ty, tz) === 0,
  `light=${world.lightAt(tx + 1, ty, tz)}`,
);

// Opening a hole to the sky brightens the column.
const holeX = 70;
const holeZ = 70;
const holeTop = world.terrain.heightMap[holeX + holeZ * WORLD_X];
world.setBlock(holeX, holeTop, holeZ, Block.AIR);
check(
  'digging down lets sky light in',
  world.skyLightAt(holeX, holeTop, holeZ) === 15,
  `sky=${world.skyLightAt(holeX, holeTop, holeZ)}`,
);
check('solid rock below the hole stays dark', world.skyLightAt(holeX, holeTop - 1, holeZ) === 0);

/* ------------------------------------------------------------------ */
section('Ray casting');
const ray = world.raycast(
  { x: 64.5, y: surfaceY + 6, z: 64.5 } as never,
  { x: 0, y: -1, z: 0 } as never,
  60,
);
check('downward ray hits terrain', ray !== null);
if (ray) {
  check('ray hit is a solid block', blockDef(ray.block).solid);
  check('ray normal points up', ray.ny === 1, `ny=${ray.ny}`);
}
const miss = world.raycast(
  { x: 64.5, y: surfaceY + 6, z: 64.5 } as never,
  { x: 0, y: 1, z: 0 } as never,
  60,
);
check('upward ray finds nothing solid', miss === null);

/* ------------------------------------------------------------------ */
section('Chunk meshing');
const mesh = (await import('../src/world/mesher')).buildChunkMesh(world, 4, 4);
check('opaque geometry is generated', (mesh.opaque?.getAttribute('position')?.count ?? 0) > 0);
const lightAttr = mesh.opaque?.getAttribute('alight');
check('vertex light attribute exists', (lightAttr?.count ?? 0) > 0);
if (lightAttr) {
  let maxSky = 0;
  for (let i = 0; i < lightAttr.count; i++) maxSky = Math.max(maxSky, lightAttr.getY(i));
  check('sky light is baked into vertices', maxSky > 0.5, `maxSky=${maxSky}`);
}
check('uv attribute count matches positions', mesh.opaque?.getAttribute('uv')?.count === mesh.opaque?.getAttribute('position')?.count);

/* ------------------------------------------------------------------ */
section('Inventory');
const inv = new Inventory(36);
inv.add('stone', 10);
inv.add('stone', 60);
check('stacks merge into 64 + remainder', inv.count('stone') === 70, `count=${inv.count('stone')}`);
check('stacks cap at 64', inv.slots.filter((s) => s?.id === 'stone').every((s) => (s?.count ?? 0) <= 64));
const overflow = new Inventory(2);
check('overflow returns leftovers when the pack is full', overflow.add('stone', 200) === 72, `left=${overflow.add('stone', 200)}`);
check('overflow still stores what fits', overflow.count('stone') === 128);
inv.add('dirt', 5);
check('remove works', inv.remove('dirt', 5) && inv.count('dirt') === 0);
check('remove refuses when short', inv.remove('dirt', 5) === false);
inv.select(3);
check('hotbar selection clamps', (inv.select(-1), inv.selected === 8));

/* ------------------------------------------------------------------ */
section('Item and recipe integrity');
let badItems = 0;
for (const [id] of ITEM_TO_BLOCK) {
  if (!hasItem(id)) {
    console.error(`    missing item for block id: ${id}`);
    badItems++;
  }
}
check('every placeable block has an item', badItems === 0);

let badDrops = 0;
for (const id of Object.keys(ITEM_TO_BLOCK)) {
  const block = ITEM_TO_BLOCK.get(id)!;
  const def = blockDef(block);
  if (def.drop && !hasItem(def.drop)) {
    console.error(`    missing drop item: ${def.drop}`);
    badDrops++;
  }
}
check('every block drop maps to an item', badDrops === 0);

let badRecipeItems = 0;
for (const recipe of allRecipes()) {
  if (!hasItem(recipe.output.item)) {
    console.error(`    recipe output missing: ${recipe.output.item}`);
    badRecipeItems++;
  }
  for (const ing of recipe.ingredients) {
    if (!hasItem(ing.item)) {
      console.error(`    recipe ingredient missing: ${ing.item}`);
      badRecipeItems++;
    }
  }
}
check('all recipes reference real items', badRecipeItems === 0);
check('recipe list is populated', allRecipes().length > 20);

/* ------------------------------------------------------------------ */
section('Progression data');
check('upgrades have unique ids', new Set(UPGRADES.map((u) => u.id)).size === UPGRADES.length);
check('upgrades cost credits', UPGRADES.every((u) => u.cost > 0));
check('quests have unique ids', new Set(QUESTS.map((q) => q.id)).size === QUESTS.length);
const stats = new Stats();
stats.add('blocksMined', 20);
check('quest stats track progress', stats.get('blocksMined') === 20);
const restored = Stats.fromJSON(stats.toJSON() as Record<string, unknown>);
check('stats survive a save/load round trip', restored.get('blocksMined') === 20);

/* ------------------------------------------------------------------ */
section('World edit bookkeeping');
const before = world.edits.size;
world.setBlock(10, 40, 10, Block.PLANK);
check('edits are recorded for saving', world.edits.size === before + 1);
const saved: Array<[number, number]> = [];
for (const [i, id] of world.edits) saved.push([i, id]);
const world2 = new World(12345);
world2.applyEdits(saved);
check('edits replay onto a fresh world', world2.getBlock(10, 40, 10) === Block.PLANK);
check('replayed world matches the edited block', world2.getBlock(10, 40, 10) === world.getBlock(10, 40, 10));

/* ------------------------------------------------------------------ */
section('Determinism');
const worldA = new World(999);
const worldB = new World(999);
let same = true;
for (let i = 0; i < worldA.blocks.length; i += 97) {
  if (worldA.blocks[i] !== worldB.blocks[i]) {
    same = false;
    break;
  }
}
check('same seed produces the same world', same);
check('world dimensions are consistent', WORLD_X * WORLD_Y * WORLD_Z === world.blocks.length);

/* ------------------------------------------------------------------ */
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
