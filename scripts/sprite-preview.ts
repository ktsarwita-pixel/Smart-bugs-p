/**
 * Sprite preview: renders the texture atlas and the item icons to PNG files
 * so the art can be looked at without a browser.
 *
 *   npx esbuild scripts/sprite-preview.ts --bundle --platform=node --format=esm \
 *     --outfile=.cache/sprites.mjs --external:jsdom && node .cache/sprites.mjs
 *
 * Writes `.cache/atlas.png` and `.cache/icons.png`.
 */
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootDom, encodePng, scale, type MockContext } from './sprite-harness';

/* ------------------------------------------------------------------ */
/* Boot a DOM with the mock context                                   */
/* ------------------------------------------------------------------ */

const { contexts } = await bootDom();

mkdirSync(resolve(process.cwd(), '.cache'), { recursive: true });

const { buildAtlas } = await import('../src/render/textures');
const { TILE_NAMES, ATLAS_COLS } = await import('../src/world/tiles');

const atlas = buildAtlas();
const atlasCtx = contexts.get(atlas) as MockContext;
const atlasImg = scale(atlasCtx.pixels, atlasCtx.width, atlasCtx.height, 6);
writeFileSync(resolve(process.cwd(), '.cache/atlas.png'), encodePng(atlasImg.width, atlasImg.height, atlasImg.pixels));
console.log(`atlas.png  ${atlasImg.width}x${atlasImg.height}  (${TILE_NAMES.length} tiles, ${ATLAS_COLS} per row)`);

// The mining cracks.
const { buildCrackStrip } = await import('../src/render/textures');
const crackCanvas = buildCrackStrip();
const crackCtx = contexts.get(crackCanvas) as MockContext;
const crackImg = scale(crackCtx.pixels, crackCtx.width, crackCtx.height, 6);
writeFileSync(resolve(process.cwd(), '.cache/cracks.png'), encodePng(crackImg.width, crackImg.height, crackImg.pixels));
console.log(`cracks.png  ${crackImg.width}x${crackImg.height}  (10 stages)`);

// The item icons, laid out in a grid.
const { itemIcon } = await import('../src/render/textures');
const iconIds = [
  'pickaxe_wood', 'pickaxe_stone', 'pickaxe_iron', 'pickaxe_steel',
  'axe_iron', 'shovel_steel', 'sword_iron', 'drill_sulfur',
  'coal', 'raw_iron', 'iron_ingot', 'raw_gold',
  'gold_ingot', 'steel_ingot', 'diamond', 'sulfur_dust',
  'sulfur_crystal', 'clay', 'stick', 'gas_mask',
  'lantern', 'scanner', 'backpack', 'thruster',
  'battery_cell', 'beef', 'bread',
];

const COLS = 7;
const CELL = 32;
const rows = Math.ceil(iconIds.length / COLS);
const sheetW = COLS * CELL;
const sheetH = rows * CELL;
const sheet = new Uint8ClampedArray(sheetW * sheetH * 4);
for (let i = 0; i < iconIds.length; i++) {
  const url = itemIcon(iconIds[i]!);
  const b64 = url.split(',')[1] ?? '';
  const png = Buffer.from(b64, 'base64');
  // Decode the PNG we just wrote (all of them are filter-0 RGBA).
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const idat = png.subarray(png.indexOf(Buffer.from('IDAT')) + 4);
  const inflated = zlib.inflateSync(idat);
  const cx = (i % COLS) * CELL;
  const cy = Math.floor(i / COLS) * CELL;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = y * (width * 4 + 1) + 1 + x * 4;
      const a = inflated[si + 3]! / 255;
      const di = ((cy + y) * sheetW + cx + x) * 4;
      sheet[di] = Math.round(inflated[si]! * a + 26 * (1 - a));
      sheet[di + 1] = Math.round(inflated[si + 1]! * a + 24 * (1 - a));
      sheet[di + 2] = Math.round(inflated[si + 2]! * a + 22 * (1 - a));
      sheet[di + 3] = 255;
    }
  }
}
const sheetImg = scale(sheet, sheetW, sheetH, 3);
writeFileSync(resolve(process.cwd(), '.cache/icons.png'), encodePng(sheetImg.width, sheetImg.height, sheetImg.pixels));
console.log(`icons.png  ${sheetImg.width}x${sheetImg.height}  (${iconIds.length} icons)`);
process.exit(0);
