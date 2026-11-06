/**
 * Sprite regression tests: the procedural art is checked pixel by pixel.
 *
 *   npx esbuild scripts/sprite-test.ts --bundle --platform=node --format=esm \
 *     --outfile=.cache/spritetest.mjs --external:jsdom && node .cache/spritetest.mjs
 */
import { bootDom } from './sprite-harness';

let failures = 0;
let checks = 0;
function check(name: string, condition: boolean, extra = ''): void {
  checks++;
  if (condition) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

const { contexts } = await bootDom();

const { buildAtlas, itemIcon, hasItemIcon, buildCrackStrip } = await import('../src/render/textures');
const { TILE_NAMES, ATLAS_COLS, TILE_PX } = await import('../src/world/tiles');
const { allItemIds, itemDef } = await import('../src/game/items');
const { blockDef, ITEM_TO_BLOCK } = await import('../src/world/blocks');

/* ------------------------------------------------------------------ */
console.log('\nAtlas');
/* ------------------------------------------------------------------ */
const atlas = buildAtlas();
const ctx = contexts.get(atlas)!;
check('the atlas has a pixel buffer', ctx.width === ATLAS_COLS * TILE_PX, `w=${ctx.width}`);

function tilePixels(name: string): Uint8ClampedArray {
  const index = TILE_NAMES.indexOf(name as (typeof TILE_NAMES)[number]);
  const ox = (index % ATLAS_COLS) * TILE_PX;
  const oy = Math.floor(index / ATLAS_COLS) * TILE_PX;
  const out = new Uint8ClampedArray(TILE_PX * TILE_PX * 4);
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const si = ((oy + y) * ctx.width + ox + x) * 4;
      const di = (y * TILE_PX + x) * 4;
      out[di] = ctx.pixels[si]!;
      out[di + 1] = ctx.pixels[si + 1]!;
      out[di + 2] = ctx.pixels[si + 2]!;
      out[di + 3] = ctx.pixels[si + 3]!;
    }
  }
  return out;
}

function opaqueCount(px: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i]! > 128) n++;
  return n;
}

const cutouts = ['leaves', 'glass', 'torch', 'fungus', 'crystal_shard'];
for (const name of TILE_NAMES) {
  const px = tilePixels(name);
  const opaque = opaqueCount(px);
  if (name.startsWith('crack_')) {
    check(`${name} is an overlay`, opaque < TILE_PX * TILE_PX, `${opaque} opaque pixels`);
  } else if (cutouts.includes(name)) {
    check(`${name} is cut out`, opaque < TILE_PX * TILE_PX, `${opaque} opaque pixels`);
    check(`${name} still has art`, opaque > 10, `${opaque} opaque pixels`);
  } else {
    check(`${name} is painted`, opaque === TILE_PX * TILE_PX, `${opaque} opaque pixels`);
  }
}

// Every tile should use more than one colour, otherwise it looks flat.
for (const name of TILE_NAMES) {
  if (name.startsWith('crack_')) continue;
  const px = tilePixels(name);
  const colours = new Set<string>();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3]! < 128) continue;
    colours.add(`${px[i]},${px[i + 1]},${px[i + 2]}`);
  }
  check(`${name} has shading`, colours.size >= 3, `${colours.size} colours`);
}

/* ------------------------------------------------------------------ */
console.log('\nThe torch');
/* ------------------------------------------------------------------ */
{
  // The torch is rendered as a post: the sides show the middle two columns
  // of the tile and the top shows the flame.
  const px = tilePixels('torch');
  const at = (x: number, y: number): number => px[(y * TILE_PX + x) * 4 + 3]!;
  const stickOpaque = [at(7, 12), at(8, 12), at(7, 14), at(8, 14)].every((a) => a > 200);
  check('the torch stick sits in the middle two columns', stickOpaque);
  const outsideOpaque = [at(3, 12), at(4, 12), at(11, 12), at(12, 12)].some((a) => a > 200);
  check('the torch has no stick outside the middle columns', !outsideOpaque);
  const flameLit = at(7, 4) > 200 && at(8, 5) > 200;
  check('the torch flame is at the top', flameLit);
  const flameBelow = at(7, 9) > 200;
  check('the torch stick starts under the flame', flameBelow);
}

/* ------------------------------------------------------------------ */
console.log('\nItem icons');
/* ------------------------------------------------------------------ */
const missing = allItemIds().filter((id) => !hasItemIcon(id));
check('every item has a sprite of its own', missing.length === 0, `missing: ${missing.join(', ')}`);

// The tools have to be different from one another.
const tools = allItemIds().filter((id) => !!itemDef(id).tool);
const toolPixels = new Map<string, string>();
for (const id of tools) {
  const url = itemIcon(id);
  toolPixels.set(id, url.slice(url.length - 40));
}
const unique = new Set(toolPixels.values());
check(
  'every tool has its own drawing',
  unique.size === tools.length,
  `${unique.size} different drawings for ${tools.length} tools`,
);

// The block items are drawn as cubes from the atlas.
const blockItems = [...ITEM_TO_BLOCK.keys()];
check('the game has block items', blockItems.length > 10, `${blockItems.length}`);
for (const id of ['stone', 'coal_ore', 'sulfur_crystal']) {
  check(`${id} has a cube icon`, itemIcon(id).startsWith('data:image'));
}

// A block icon has to use the block's own tile, not the fallback gem.
const oreIcon = itemIcon('coal_ore');
check('ore blocks use the atlas', oreIcon.length > 100);

// The mining cracks: ten stages in a strip.
const crackStrip = buildCrackStrip();
check('the crack strip holds ten stages', crackStrip.width === 160 && crackStrip.height === 16, `${crackStrip.width}x${crackStrip.height}`);
{
  const crackCtx = contexts.get(crackStrip)!;
  let painted = 0;
  for (let stage = 0; stage < 10; stage++) {
    let stagePixels = 0;
    for (let x = stage * TILE_PX; x < stage * TILE_PX + TILE_PX; x++) {
      for (let y = 0; y < TILE_PX; y++) {
        const i = (y * crackCtx.width + x) * 4;
        if ((crackCtx.pixels[i + 3] ?? 0) > 40) stagePixels++;
      }
    }
    if (stagePixels > 0) painted++;
  }
  check('every crack stage has marks', painted === 10, `${painted}/10`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
process.exit(0);
