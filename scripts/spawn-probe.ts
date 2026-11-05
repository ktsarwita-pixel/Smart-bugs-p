/** Prints the terrain column profile around the player spawn. */
import { generateTerrain } from '../src/world/terrain';
import { WORLD_X, WORLD_Y, WORLD_Z } from '../src/core/constants';
import { Block } from '../src/world/blocks';

const blocks = new Uint8Array(WORLD_X * WORLD_Y * WORLD_Z);
const seed = 424242;
const terrain = generateTerrain(blocks, seed);
const at = (x: number, y: number, z: number): number => blocks[(y * WORLD_Z + z) * WORLD_X + x];

const { x, y, z } = terrain.spawn;
console.log(`spawn = (${x}, ${y}, ${z})`);
const bx = Math.floor(x);
const bz = Math.floor(z);
console.log('\ncolumn profile around the spawn (row = z, col = x), "." = air');
for (let dz = -6; dz <= 6; dz++) {
  let row = '';
  for (let dx = -6; dx <= 6; dx++) {
    const b = at(bx + dx, y + 1, bz + dz);
    row += b === Block.AIR ? '.' : '#';
  }
  console.log(`${String(bz + dz).padStart(3)} ${row}`);
}
console.log(`\nspawn column (x=${bx}, z=${bz}) from y=${y + 3} down to y=${y - 25}:`);
for (let yy = y + 3; yy >= y - 25; yy--) {
  const b = at(bx, yy, bz);
  console.log(`  y=${yy}: ${b === Block.AIR ? 'AIR' : `block ${b}`}`);
}
