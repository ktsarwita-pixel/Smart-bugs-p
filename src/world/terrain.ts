import { BEDROCK_TOP, SEA_LEVEL, WORLD_X, WORLD_Y, WORLD_Z } from '../core/constants';
import { fbm2, fbm3, hash2, hash3, ridge2, value2 } from '../core/rng';
import { Block } from './blocks';

export interface TerrainResult {
  /** Y of the topmost solid block for each column. */
  heightMap: Int16Array;
  /** Top block id of each column. */
  surfaceMap: Uint8Array;
  /** Biome id: 0 verdant, 1 ash, 2 volcanic. */
  biomeMap: Uint8Array;
  /** Spawn point (surface of the home shaft). */
  spawn: { x: number; y: number; z: number };
}

const idx = (x: number, z: number): number => x + z * WORLD_X;

export function generateTerrain(
  blocks: Uint8Array,
  seed: number,
): TerrainResult {
  const heightMap = new Int16Array(WORLD_X * WORLD_Z);
  const surfaceMap = new Uint8Array(WORLD_X * WORLD_Z);
  const biomeMap = new Uint8Array(WORLD_X * WORLD_Z);

  const centreX = WORLD_X >> 1;
  const centreZ = WORLD_Z >> 1;

  for (let z = 0; z < WORLD_Z; z++) {
    for (let x = 0; x < WORLD_X; x++) {
      const cont = fbm2(x * 0.0045, z * 0.0045, seed, 4);
      const hill = fbm2(x * 0.021, z * 0.021, seed + 31, 3);
      const mtn = ridge2(x * 0.0105, z * 0.0105, seed + 57, 4);
      const volcano = fbm2(x * 0.0075, z * 0.0075, seed + 91, 3);
      const temp = fbm2(x * 0.006, z * 0.006, seed + 211, 3);

      // Keep the middle of the map flat so the home shaft always makes sense.
      // The base itself is dead flat (the hut has to sit on solid ground).
      const distToCentre = Math.hypot(x - centreX, z - centreZ);
      const flatten =
        distToCentre <= 7 ? 1 : Math.max(0, 1 - (distToCentre - 7) / 9);

      let height =
        18 + cont * 24 + hill * 7 + Math.pow(mtn, 3.2) * 34 + volcano * 8;
      height = height * (1 - flatten) + (SEA_LEVEL + 3) * flatten;

      let biome: number;
      if (volcano > 0.63) biome = 2;
      else if (volcano > 0.5 || temp < 0.3) biome = 1;
      else biome = 0;

      let h = Math.floor(height);
      if (h < SEA_LEVEL - 3) h = SEA_LEVEL - 3;
      if (h > WORLD_Y - 12) h = WORLD_Y - 12;

      heightMap[idx(x, z)] = h;
      biomeMap[idx(x, z)] = biome;
    }
  }

  // Carve a bowl for the caldera around the volcano centre.
  const calderaX = Math.floor(WORLD_X * 0.78);
  const calderaZ = Math.floor(WORLD_Z * 0.22);
  for (let z = 0; z < WORLD_Z; z++) {
    for (let x = 0; x < WORLD_X; x++) {
      const d = Math.hypot(x - calderaX, z - calderaZ);
      if (d < 26) {
        const k = 1 - d / 26;
        const i = idx(x, z);
        heightMap[i] = Math.floor(heightMap[i] - k * k * 14);
        if (k > 0.35) biomeMap[i] = 2;
      }
    }
  }

  // Fill the block volume.
  for (let z = 0; z < WORLD_Z; z++) {
    for (let x = 0; x < WORLD_X; x++) {
      const i = idx(x, z);
      const h = heightMap[i];
      const biome = biomeMap[i];
      // Surface material.
      let topBlock: number;
      if (h < SEA_LEVEL - 1) topBlock = Block.SAND;
      else if (biome === 2) topBlock = h > 44 ? Block.ASH : Block.SULFUR_SAND;
      else if (biome === 1) topBlock = Block.SAND;
      else topBlock = Block.GRASS;

      const soilDepth = biome === 2 ? 4 : 3;
      const soilBlock = biome === 0 ? Block.DIRT : biome === 1 ? Block.SAND : Block.ASH;

      for (let y = 0; y <= h; y++) {
        let block: number;
        if (y <= BEDROCK_TOP) {
          block = Block.BEDROCK;
        } else if (y === h) {
          block = topBlock;
        } else if (y > h - soilDepth) {
          block = soilBlock;
        } else if (y < 18) {
          block = Block.DEEPSLATE;
        } else {
          block = Block.STONE;
        }

        // Caves.
        if (y > BEDROCK_TOP + 1 && y < h - 1) {
          const cave = fbm3(x * 0.032, y * 0.055, z * 0.032, seed + 5, 3);
          const tunnel = Math.abs(fbm3(x * 0.018, y * 0.03, z * 0.018, seed + 17, 2) - 0.5);
          if (cave > 0.63 || tunnel < 0.045) block = Block.AIR;
        }

        // Ores.
        if (block === Block.STONE || block === Block.DEEPSLATE) {
          const oreNoise = hash3(x, y, z, seed + 404);
          const cluster = value2(x * 0.11 + y * 0.07, z * 0.11, seed + 808);
          if (y < 58 && cluster > 0.62 && oreNoise > 0.42) block = Block.COAL_ORE;
          else if (y < 46 && cluster > 0.7 && oreNoise > 0.55) block = Block.IRON_ORE;
          else if (y < 30 && cluster > 0.76 && oreNoise > 0.66) block = Block.GOLD_ORE;
          else if (y < 18 && cluster > 0.82 && oreNoise > 0.74) block = Block.DIAMOND_ORE;
          else if (y < 44 && cluster > 0.55 && oreNoise > 0.5) {
            const sulfurBias = biome === 2 ? 0.06 : 0.0;
            if (cluster > 0.6 - sulfurBias && oreNoise > 0.52) block = Block.SULFUR_ORE;
          }
          if (block === Block.STONE && hash3(x, y, z, seed + 1234) > 0.94) {
            block = Block.MOSSY_STONE;
          }
        }

        // Lava pools deep down.
        if (block === Block.AIR && y < 13 && hash3(x, y, z, seed + 77) > 0.72) {
          block = Block.LAVA;
        }

        if (block !== Block.AIR) {
          blocks[(y * WORLD_Z + z) * WORLD_X + x] = block;
        }
      }

      // Water fill up to sea level.
      for (let y = h + 1; y <= SEA_LEVEL; y++) {
        blocks[(y * WORLD_Z + z) * WORLD_X + x] = Block.WATER;
      }
      surfaceMap[i] = topBlock;
    }
  }

  // Sulfur crystal pockets in the deep.
  for (let attempt = 0; attempt < 900; attempt++) {
    const x = Math.floor(hash2(attempt, 3, seed + 777) * WORLD_X);
    const z = Math.floor(hash2(attempt, 7, seed + 777) * WORLD_Z);
    const y = 4 + Math.floor(hash2(attempt, 11, seed + 777) * 20);
    const r = 1 + Math.floor(hash2(attempt, 13, seed + 777) * 2);
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.hypot(dx, dy, dz) > r) continue;
          const bx = x + dx;
          const by = y + dy;
          const bz = z + dz;
          if (bx < 0 || bz < 0 || by < 1 || bx >= WORLD_X || bz >= WORLD_Z || by >= WORLD_Y) continue;
          const p = (by * WORLD_Z + bz) * WORLD_X + bx;
          if (blocks[p] === Block.AIR) blocks[p] = Block.SULFUR_CRYSTAL;
          else if (blocks[p] === Block.DEEPSLATE || blocks[p] === Block.STONE) {
            if (hash3(bx, by, bz, seed + 999) > 0.72) blocks[p] = Block.SULFUR_CRYSTAL;
          }
        }
      }
    }
  }

  const spawn = buildHomeShaft(blocks, heightMap, centreX, centreZ, seed);
  return { heightMap, surfaceMap, biomeMap, spawn };
}

/**
 * Builds the abandoned company shaft at the middle of the map: a lit vertical
 * tunnel with a landing platform, a smelter, a charger and a beacon. It is the
 * player's home base.
 */
function buildHomeShaft(
  blocks: Uint8Array,
  heightMap: Int16Array,
  cx: number,
  cz: number,
  seed: number,
): { x: number; y: number; z: number } {
  const set = (x: number, y: number, z: number, block: number): void => {
    if (x < 0 || z < 0 || y < 0 || x >= WORLD_X || z >= WORLD_Z || y >= WORLD_Y) return;
    blocks[(y * WORLD_Z + z) * WORLD_X + x] = block;
  };

  const surfaceY = heightMap[idx(cx, cz)];
  const floorY = 12;

  // Vertical shaft 5x5.
  for (let y = floorY; y <= surfaceY + 1; y++) {
    for (let z = cz - 2; z <= cz + 2; z++) {
      for (let x = cx - 2; x <= cx + 2; x++) {
        set(x, y, z, Block.AIR);
      }
    }
  }

  // Shaft walls with plank supports every 5 blocks.
  for (let y = floorY; y <= surfaceY + 1; y++) {
    for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2]] as const) {
      for (let o = -1; o <= 1; o++) {
        const wx = dx === 0 ? cx + o * 2 : cx + dx;
        const wz = dz === 0 ? cz + o * 2 : cz + dz;
        set(wx, y, wz, y % 5 === 0 ? Block.PLANK : Block.STONE);
      }
    }
    if (y % 5 === 2) {
      set(cx - 2, y, cz, Block.TORCH);
      set(cx + 2, y, cz, Block.TORCH);
    }
  }

  // Zig-zag staircase: the miner can walk down instead of falling the full
  // twenty blocks, and a fall is broken up by the steps.
  for (let y = floorY; y <= surfaceY; y++) {
    const side = (y - floorY) % 2 === 0 ? -1 : 1;
    set(cx + side, y, cz, Block.PLANK);
    set(cx + side, y, cz - 1, Block.PLANK);
  }

  // Landing platform at the bottom.
  for (let z = cz - 4; z <= cz + 4; z++) {
    for (let x = cx - 4; x <= cx + 4; x++) {
      const edge = Math.abs(x - cx) >= 3 || Math.abs(z - cz) >= 3;
      set(x, floorY - 1, z, edge ? Block.PLANK : Block.STEEL_BLOCK);
      set(x, floorY, z, Block.AIR);
    }
  }

  // Base machines.
  set(cx - 3, floorY, cz - 3, Block.SMELTER);
  set(cx + 3, floorY, cz - 3, Block.CHARGER);
  set(cx + 3, floorY, cz + 3, Block.BEACON);
  set(cx - 3, floorY, cz + 3, Block.BEACON);
  set(cx, floorY, cz - 3, Block.LAMP);

  // Minecart rails down the shaft.
  for (let y = floorY; y <= surfaceY; y++) {
    set(cx - 1, y, cz - 1, Block.PLANK);
    set(cx + 1, y, cz - 1, Block.PLANK);
  }

  // Surface hut around the shaft mouth. It has to be tall enough for the
  // miner to walk around inside: floor at surfaceY, two wall courses and a
  // roof at surfaceY + 3.
  for (let z = cz - 5; z <= cz + 5; z++) {
    for (let x = cx - 5; x <= cx + 5; x++) {
      const edge = Math.abs(x - cx) === 5 || Math.abs(z - cz) === 5;
      if (edge && Math.abs(x - cx) + Math.abs(z - cz) !== 0) {
        const corner = Math.abs(x - cx) === 5 && Math.abs(z - cz) === 5;
        if (!corner) {
          set(x, surfaceY + 1, z, Block.PLANK);
          set(x, surfaceY + 2, z, Block.PLANK);
          set(x, surfaceY + 3, z, Block.AIR);
        }
      }
    }
  }
  for (let z = cz - 4; z <= cz + 4; z++) {
    set(cx - 4, surfaceY + 3, z, Block.PLANK);
    set(cx + 4, surfaceY + 3, z, Block.PLANK);
  }
  for (let x = cx - 4; x <= cx + 4; x++) {
    set(x, surfaceY + 3, cz - 4, Block.PLANK);
    set(x, surfaceY + 3, cz + 4, Block.PLANK);
  }
  set(cx - 4, surfaceY + 2, cz - 4, Block.LAMP);
  set(cx + 4, surfaceY + 2, cz + 4, Block.LAMP);
  // A charge pad on the hut floor: BOLT-7 has to be able to recharge without
  // the miner first descending the whole shaft.
  set(cx + 2, surfaceY + 1, cz - 2, Block.CHARGER);

  // Doorway on the north wall so the miner can walk out, plus a window.
  set(cx - 1, surfaceY + 1, cz - 4, Block.AIR);
  set(cx, surfaceY + 1, cz - 4, Block.AIR);
  set(cx + 1, surfaceY + 1, cz - 4, Block.AIR);
  set(cx - 1, surfaceY + 2, cz - 4, Block.AIR);
  set(cx, surfaceY + 2, cz - 4, Block.AIR);
  set(cx + 1, surfaceY + 2, cz - 4, Block.AIR);
  set(cx + 4, surfaceY + 1, cz, Block.AIR);
  set(cx + 4, surfaceY + 2, cz, Block.AIR);
  // Cap the doorway so the hut keeps its roof.
  set(cx - 1, surfaceY + 3, cz - 4, Block.PLANK);
  set(cx, surfaceY + 3, cz - 4, Block.PLANK);
  set(cx + 1, surfaceY + 3, cz - 4, Block.PLANK);
  set(cx + 4, surfaceY + 3, cz, Block.PLANK);
  // Short steps down to the surface outside the door.
  set(cx - 1, surfaceY, cz - 5, Block.PLANK);
  set(cx, surfaceY, cz - 5, Block.PLANK);
  set(cx + 1, surfaceY, cz - 5, Block.PLANK);

  // A couple of crates of supplies.
  set(cx - 3, surfaceY + 1, cz + 4, Block.PLANK);
  set(cx + 3, surfaceY + 1, cz - 4, Block.PLANK);

  // Random pine trees on the surface.
  for (let attempt = 0; attempt < 900; attempt++) {
    const x = Math.floor(hash2(attempt, 23, seed + 321) * WORLD_X);
    const z = Math.floor(hash2(attempt, 29, seed + 321) * WORLD_Z);
    if (Math.hypot(x - cx, z - cz) < 9) continue;
    const h = heightMap[idx(x, z)];
    if (h <= SEA_LEVEL) continue;
    const surface = blocks[(h * WORLD_Z + z) * WORLD_X + x];
    if (surface !== Block.GRASS) continue;
    if (hash2(attempt, 31, seed + 654) > 0.55) continue;
    growPine(blocks, x, h + 1, z, seed + attempt);
  }

  // The spawn sits on the hut floor beside the shaft mouth — spawning over
  // the shaft dropped the player twenty blocks into a death pit.
  // `spawn` is the position of the miner's feet: the block below is solid and
  // the block at the spawn itself is clear.
  return { x: cx - 3.5, y: surfaceY + 1, z: cz + 0.5 };
}

function growPine(
  blocks: Uint8Array,
  x: number,
  y: number,
  z: number,
  seed: number,
): void {
  const set = (px: number, py: number, pz: number, block: number): void => {
    if (px < 0 || pz < 0 || py < 0 || px >= WORLD_X || pz >= WORLD_Z || py >= WORLD_Y) return;
    blocks[(py * WORLD_Z + pz) * WORLD_X + px] = block;
  };
  const height = 5 + Math.floor(hash2(x, z, seed) * 4);
  for (let i = 0; i < height; i++) set(x, y + i, z, Block.LOG);
  const canopyBase = y + 2;
  const layers = height - 1;
  for (let l = 0; l < layers; l++) {
    const ly = canopyBase + l;
    const radius = Math.max(0, Math.round((layers - l) * 0.62));
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) === radius && Math.abs(dz) === radius && radius > 1) continue;
        if (dx === 0 && dz === 0 && l < layers - 1) continue;
        if (set.length === 0) continue;
        const p = (ly * WORLD_Z + z + dz) * WORLD_X + x + dx;
        if (blocks[p] === Block.AIR) blocks[p] = Block.LEAVES;
      }
    }
  }
  set(x, y + height, z, Block.LEAVES);
}
