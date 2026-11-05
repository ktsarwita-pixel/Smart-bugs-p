import * as THREE from 'three';
import { CHUNKS_X, CHUNKS_Z, WORLD_X, WORLD_Y, WORLD_Z } from '../core/constants';
import { Block, blockDef, isOpaque } from './blocks';
import { generateTerrain, type TerrainResult } from './terrain';
import { buildChunkMesh } from './mesher';
import type { VoxelMaterialSet } from '../render/materials';

export interface RaycastHit {
  x: number;
  y: number;
  z: number;
  /** Face normal. */
  nx: number;
  ny: number;
  nz: number;
  block: number;
  distance: number;
  /** Exact hit position. */
  point: THREE.Vector3;
}

export interface Chunk {
  cx: number;
  cz: number;
  meshes: THREE.Mesh[];
  dirty: boolean;
  maxY: number;
  lastSeen: number;
}

const index = (x: number, y: number, z: number): number => (y * WORLD_Z + z) * WORLD_X + x;

export class World {
  readonly blocks: Uint8Array;
  readonly skyLight: Uint8Array;
  readonly blockLight: Uint8Array;
  readonly seed: number;
  readonly terrain: TerrainResult;

  /** Highest non-air y per column (used to skip empty space while meshing). */
  private columnTops: Int16Array;
  private chunks = new Map<string, Chunk>();
  private group = new THREE.Group();
  private materials: VoxelMaterialSet | null = null;

  /** Recorded player edits (index -> block id) for save/load. */
  readonly edits = new Map<number, number>();

  constructor(seed: number) {
    this.seed = seed;
    this.blocks = new Uint8Array(WORLD_X * WORLD_Y * WORLD_Z);
    this.skyLight = new Uint8Array(WORLD_X * WORLD_Y * WORLD_Z);
    this.blockLight = new Uint8Array(WORLD_X * WORLD_Y * WORLD_Z);
    this.terrain = generateTerrain(this.blocks, seed);
    this.columnTops = new Int16Array(WORLD_X * WORLD_Z);
    for (let z = 0; z < WORLD_Z; z++) {
      for (let x = 0; x < WORLD_X; x++) {
        let top = 0;
        for (let y = WORLD_Y - 1; y >= 0; y--) {
          if (this.blocks[index(x, y, z)] !== Block.AIR) {
            top = y;
            break;
          }
        }
        this.columnTops[x + z * WORLD_X] = top;
      }
    }
    this.computeInitialLighting();
  }

  attach(scene: THREE.Scene, materials: VoxelMaterialSet): void {
    this.materials = materials;
    this.group.name = 'voxel-world';
    scene.add(this.group);
  }

  /* ---------------------------------------------------------------- */
  /* Access                                                            */
  /* ---------------------------------------------------------------- */

  getBlock(x: number, y: number, z: number): number {
    if (x < 0 || z < 0 || y < 0 || x >= WORLD_X || z >= WORLD_Z || y >= WORLD_Y) return Block.AIR;
    return this.blocks[index(x, y, z)];
  }

  getBlockSafe(x: number, y: number, z: number): number {
    if (x < 0 || z < 0 || y < 0 || x >= WORLD_X || z >= WORLD_Z || y >= WORLD_Y) return Block.BEDROCK;
    return this.blocks[index(x, y, z)];
  }

  isOpaqueAt(x: number, y: number, z: number): boolean {
    if (x < 0 || z < 0 || y < 0 || x >= WORLD_X || z >= WORLD_Z || y >= WORLD_Y) return true;
    return isOpaque(this.blocks[index(x, y, z)]);
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    if (y < 0) return true;
    if (x < 0 || z < 0 || y >= WORLD_Y || x >= WORLD_X || z >= WORLD_Z) return false;
    return blockDef(this.blocks[index(x, y, z)]).solid;
  }

  columnTop(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= WORLD_X || z >= WORLD_Z) return 0;
    return this.columnTops[x + z * WORLD_X];
  }

  /** Combined light 0..15 at a position (block light and sky light). */
  lightAt(x: number, y: number, z: number): number {
    if (x < 0 || z < 0 || y < 0 || x >= WORLD_X || z >= WORLD_Z || y >= WORLD_Y) return 0;
    const i = index(x, y, z);
    return Math.max(this.blockLight[i], this.skyLight[i]);
  }

  /** Raw index into the block arrays. */
  indexOf(x: number, y: number, z: number): number {
    return (y * WORLD_Z + z) * WORLD_X + x;
  }

  skyLightAt(x: number, y: number, z: number): number {
    if (x < 0 || z < 0 || y < 0 || x >= WORLD_X || z >= WORLD_Z || y >= WORLD_Y) return 0;
    return this.skyLight[index(x, y, z)];
  }

  /**
   * Average light across the cells touching a vertex. The first three
   * coordinates are the cell in front of the face, the remaining three
   * triples are the side/corner cells.
   */
  sampleLight(
    x: number,
    y: number,
    z: number,
    x1?: number,
    y1?: number,
    z1?: number,
    x2?: number,
    y2?: number,
    z2?: number,
    x3?: number,
    y3?: number,
    z3?: number,
  ): { sky: number; block: number } {
    let sky = 0;
    let block = 0;
    let count = 0;
    const add = (ax: number, ay: number, az: number): void => {
      if (ax < 0 || az < 0 || ay < 0 || ax >= WORLD_X || az >= WORLD_Z || ay >= WORLD_Y) return;
      const i = index(ax, ay, az);
      if (isOpaque(this.blocks[i])) return;
      sky += this.skyLight[i];
      block += this.blockLight[i];
      count++;
    };
    add(x, y, z);
    if (x1 !== undefined) add(x1, y1 ?? y, z1 ?? z);
    if (x2 !== undefined) add(x2, y2 ?? y, z2 ?? z);
    if (x3 !== undefined) add(x3, y3 ?? y, z3 ?? z);
    if (count === 0) {
      const i = index(
        Math.min(Math.max(x, 0), WORLD_X - 1),
        Math.min(Math.max(y, 0), WORLD_Y - 1),
        Math.min(Math.max(z, 0), WORLD_Z - 1),
      );
      return { sky: this.skyLight[i], block: this.blockLight[i] };
    }
    return { sky: sky / count, block: block / count };
  }

  /* ---------------------------------------------------------------- */
  /* Mutation                                                          */
  /* ---------------------------------------------------------------- */

  setBlock(x: number, y: number, z: number, id: number, record = true): boolean {
    if (x < 0 || z < 0 || y < 0 || x >= WORLD_X || z >= WORLD_Z || y >= WORLD_Y) return false;
    const i = index(x, y, z);
    const old = this.blocks[i];
    if (old === id) return false;

    const oldEmit = blockDef(old).light;
    const newEmit = blockDef(id).light;

    // --- block light ---
    if (oldEmit > 0) this.removeLight(this.blockLight, x, y, z, oldEmit);
    this.blocks[i] = id;
    if (newEmit > 0) {
      this.blockLight[i] = newEmit;
      this.addLight(this.blockLight, x, y, z);
    } else {
      this.blockLight[i] = 0;
      this.seedNeighbours(this.blockLight, x, y, z);
    }

    // --- sky light ---
    if (isOpaque(id)) {
      this.removeSkyColumn(x, y, z);
    } else {
      const above = y + 1 < WORLD_Y ? this.skyLight[index(x, y + 1, z)] : 0;
      if (above === 15 && !isOpaque(this.blocks[index(x, y + 1, z)])) {
        this.fillSkyColumn(x, y, z);
      }
    }
    this.seedNeighbours(this.skyLight, x, y, z);

    // Track column height + dirty chunks.
    const ci = x + z * WORLD_X;
    if (id !== Block.AIR && y > this.columnTops[ci]) this.columnTops[ci] = y;
    this.markDirtyAround(x, z);
    if (record) this.edits.set(i, id);
    return true;
  }

  /** Apply a batch of edits without re-lighting per block (used on load). */
  applyEdits(edits: Array<[number, number]>): void {
    for (const [i, id] of edits) {
      const x = i % WORLD_X;
      const z = Math.floor(i / WORLD_X) % WORLD_Z;
      const y = Math.floor(i / (WORLD_X * WORLD_Z));
      this.setBlock(x, y, z, id, false);
    }
  }

  markDirtyAround(x: number, z: number): void {
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    this.markDirty(cx, cz);
    if (x % 16 === 0) this.markDirty(cx - 1, cz);
    if (x % 16 === 15) this.markDirty(cx + 1, cz);
    if (z % 16 === 0) this.markDirty(cx, cz - 1);
    if (z % 16 === 15) this.markDirty(cx, cz + 1);
    if (x % 16 === 0 && z % 16 === 0) this.markDirty(cx - 1, cz - 1);
    if (x % 16 === 15 && z % 16 === 15) this.markDirty(cx + 1, cz + 1);
    if (x % 16 === 0 && z % 16 === 15) this.markDirty(cx - 1, cz + 1);
    if (x % 16 === 15 && z % 16 === 0) this.markDirty(cx + 1, cz - 1);
  }

  markDirty(cx: number, cz: number): void {
    if (cx < 0 || cz < 0 || cx >= CHUNKS_X || cz >= CHUNKS_Z) return;
    const chunk = this.getChunk(cx, cz);
    if (chunk) chunk.dirty = true;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(`${cx},${cz}`);
  }

  /* ---------------------------------------------------------------- */
  /* Lighting engine                                                   */
  /* ---------------------------------------------------------------- */

  private computeInitialLighting(): void {
    this.skyLight.fill(0);
    this.blockLight.fill(0);

    // Seed sky light down every open column.
    const skySeeds: number[] = [];
    for (let z = 0; z < WORLD_Z; z++) {
      for (let x = 0; x < WORLD_X; x++) {
        let open = true;
        for (let y = WORLD_Y - 1; y >= 0; y--) {
          const i = index(x, y, z);
          if (isOpaque(this.blocks[i])) {
            open = false;
            continue;
          }
          if (open) {
            this.skyLight[i] = 15;
            skySeeds.push(i);
          }
        }
      }
    }
    // One single breadth-first pass spreads the sky light sideways.
    this.spreadLight(this.skyLight, skySeeds);

    // Block light from emitters — also a single pass.
    const emitters: number[] = [];
    for (let y = 0; y < WORLD_Y; y++) {
      for (let z = 0; z < WORLD_Z; z++) {
        for (let x = 0; x < WORLD_X; x++) {
          const i = index(x, y, z);
          const emit = blockDef(this.blocks[i]).light;
          if (emit > 0) {
            this.blockLight[i] = emit;
            emitters.push(i);
          }
        }
      }
    }
    this.spreadLight(this.blockLight, emitters);
  }

  /** Spread light from a set of source cells, decaying by one per block. */
  private spreadLight(channel: Uint8Array, seeds: number[]): void {
    if (seeds.length === 0) return;
    const queue: number[] = seeds.slice();
    let head = 0;
    while (head < queue.length) {
      const p = queue[head++];
      const current = channel[p];
      const next = current - 1;
      if (next <= 0) continue;
      const py = Math.floor(p / (WORLD_X * WORLD_Z));
      const rem = p - py * WORLD_X * WORLD_Z;
      const pz = Math.floor(rem / WORLD_X);
      const px = rem - pz * WORLD_X;
      const neighbours = [
        px > 0 ? p - 1 : -1,
        px < WORLD_X - 1 ? p + 1 : -1,
        pz > 0 ? p - WORLD_X : -1,
        pz < WORLD_Z - 1 ? p + WORLD_X : -1,
        py > 0 ? p - WORLD_X * WORLD_Z : -1,
        py < WORLD_Y - 1 ? p + WORLD_X * WORLD_Z : -1,
      ];
      for (const n of neighbours) {
        if (n < 0) continue;
        if (isOpaque(this.blocks[n])) continue;
        if (channel[n] >= next) continue;
        channel[n] = next;
        queue.push(n);
      }
    }
  }

  /** Add light of `level` at a position, propagating into the world. */
  private addLight(channel: Uint8Array, x: number, y: number, z: number): void {
    const queue: number[] = [index(x, y, z)];
    let head = 0;
    while (head < queue.length) {
      const p = queue[head++];
      const current = channel[p];
      const next = current - 1;
      if (next <= 0) continue;
      const py = Math.floor(p / (WORLD_X * WORLD_Z));
      const rem = p - py * WORLD_X * WORLD_Z;
      const pz = Math.floor(rem / WORLD_X);
      const px = rem - pz * WORLD_X;
      const neighbours = [
        px > 0 ? p - 1 : -1,
        px < WORLD_X - 1 ? p + 1 : -1,
        pz > 0 ? p - WORLD_X : -1,
        pz < WORLD_Z - 1 ? p + WORLD_X : -1,
        py > 0 ? p - WORLD_X * WORLD_Z : -1,
        py < WORLD_Y - 1 ? p + WORLD_X * WORLD_Z : -1,
      ];
      for (const n of neighbours) {
        if (n < 0) continue;
        if (isOpaque(this.blocks[n])) continue;
        if (channel[n] >= next) continue;
        channel[n] = next;
        queue.push(n);
      }
    }
  }

  /**
   * Remove light that was sourced from a cell, then re-propagate the light
   * that comes from other sources.
   */
  private removeLight(
    channel: Uint8Array,
    x: number,
    y: number,
    z: number,
    level: number,
  ): void {
    const start = index(x, y, z);
    channel[start] = 0;
    const queue: number[] = [start];
    const levels: number[] = [level];
    const readd: number[] = [];
    let head = 0;
    while (head < queue.length) {
      const p = queue[head++];
      const lvl = levels[head - 1];
      const py = Math.floor(p / (WORLD_X * WORLD_Z));
      const rem = p - py * WORLD_X * WORLD_Z;
      const pz = Math.floor(rem / WORLD_X);
      const px = rem - pz * WORLD_X;
      const neighbours = [
        px > 0 ? p - 1 : -1,
        px < WORLD_X - 1 ? p + 1 : -1,
        pz > 0 ? p - WORLD_X : -1,
        pz < WORLD_Z - 1 ? p + WORLD_X : -1,
        py > 0 ? p - WORLD_X * WORLD_Z : -1,
        py < WORLD_Y - 1 ? p + WORLD_X * WORLD_Z : -1,
      ];
      for (const n of neighbours) {
        if (n < 0) continue;
        const nl = channel[n];
        if (nl !== 0 && nl < lvl) {
          channel[n] = 0;
          queue.push(n);
          levels.push(nl);
        } else if (nl >= lvl) {
          readd.push(n);
        }
      }
    }
    for (const n of readd) {
      if (channel[n] > 0) this.addLightAtIndex(channel, n);
    }
  }

  private addLightAtIndex(channel: Uint8Array, p: number): void {
    const queue: number[] = [p];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const current = channel[cur];
      const next = current - 1;
      if (next <= 0) continue;
      const py = Math.floor(cur / (WORLD_X * WORLD_Z));
      const rem = cur - py * WORLD_X * WORLD_Z;
      const pz = Math.floor(rem / WORLD_X);
      const px = rem - pz * WORLD_X;
      const neighbours = [
        px > 0 ? cur - 1 : -1,
        px < WORLD_X - 1 ? cur + 1 : -1,
        pz > 0 ? cur - WORLD_X : -1,
        pz < WORLD_Z - 1 ? cur + WORLD_X : -1,
        py > 0 ? cur - WORLD_X * WORLD_Z : -1,
        py < WORLD_Y - 1 ? cur + WORLD_X * WORLD_Z : -1,
      ];
      for (const n of neighbours) {
        if (n < 0) continue;
        if (isOpaque(this.blocks[n])) continue;
        if (channel[n] >= next) continue;
        channel[n] = next;
        queue.push(n);
      }
    }
  }

  /** Re-run propagation from the six neighbours of a changed cell. */
  private seedNeighbours(channel: Uint8Array, x: number, y: number, z: number): void {
    const neighbours = [
      [x - 1, y, z],
      [x + 1, y, z],
      [x, y - 1, z],
      [x, y + 1, z],
      [x, y, z - 1],
      [x, y, z + 1],
    ];
    for (const [nx, ny, nz] of neighbours) {
      if (nx < 0 || nz < 0 || ny < 0 || nx >= WORLD_X || nz >= WORLD_Z || ny >= WORLD_Y) continue;
      const i = index(nx, ny, nz);
      const level = channel[i];
      if (level > 1) this.addLightAtIndex(channel, i);
    }
  }

  /** Fill sky light down a column (no vertical decay) and spread sideways. */
  private fillSkyColumn(x: number, y: number, z: number): void {
    const seeds: number[] = [];
    for (let yy = y; yy >= 0; yy--) {
      const i = index(x, yy, z);
      if (isOpaque(this.blocks[i])) break;
      this.skyLight[i] = 15;
      seeds.push(i);
    }
    this.spreadLight(this.skyLight, seeds);
  }

  /** Remove sky light from a cell downwards (a block was placed). */
  private removeSkyColumn(x: number, y: number, z: number): void {
    for (let yy = y; yy >= 0; yy--) {
      const i = index(x, yy, z);
      if (isOpaque(this.blocks[i]) && yy !== y) break;
      const level = this.skyLight[i];
      if (level === 0) break;
      this.removeLight(this.skyLight, x, yy, z, level);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Chunk meshes                                                      */
  /* ---------------------------------------------------------------- */

  /** Rebuild a chunk's geometry and swap it into the scene. */
  rebuildChunk(cx: number, cz: number): boolean {
    if (!this.materials) return false;
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false;
    const data = buildChunkMesh(this, cx, cz);
    for (const mesh of chunk.meshes) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    chunk.meshes = [];
    const liquidMaterial = this.materials.liquid;
    const push = (geo: THREE.BufferGeometry | null, mat: THREE.Material): void => {
      if (!geo) return;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = true;
      mesh.renderOrder = mat === liquidMaterial ? 2 : 0;
      this.group.add(mesh);
      chunk.meshes.push(mesh);
    };
    push(data.opaque, this.materials.opaque);
    push(data.cutout, this.materials.cutout);
    push(data.liquid, liquidMaterial);
    chunk.dirty = false;
    return true;
  }

  ensureChunk(cx: number, cz: number): Chunk {
    let chunk = this.getChunk(cx, cz);
    if (!chunk) {
      chunk = { cx, cz, meshes: [], dirty: true, maxY: 0, lastSeen: 0 };
      this.chunks.set(`${cx},${cz}`, chunk);
    }
    return chunk;
  }

  /** Remove a chunk's meshes from the scene and free the geometry. */
  unloadChunk(cx: number, cz: number): boolean {
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false;
    for (const mesh of chunk.meshes) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    chunk.meshes = [];
    this.chunks.delete(`${cx},${cz}`);
    return true;
  }

  /** Every chunk currently held in memory. */
  listChunks(): Chunk[] {
    return [...this.chunks.values()];
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) {
      for (const mesh of chunk.meshes) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    this.chunks.clear();
  }

  /* ---------------------------------------------------------------- */
  /* Ray casting                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Amanatides & Woo voxel traversal.
   * Returns the first solid block hit, or null.
   */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): RaycastHit | null {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = direction.x > 0 ? 1 : -1;
    const stepY = direction.y > 0 ? 1 : -1;
    const stepZ = direction.z > 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / (direction.x || 1e-9));
    const tDeltaY = Math.abs(1 / (direction.y || 1e-9));
    const tDeltaZ = Math.abs(1 / (direction.z || 1e-9));

    const bound = (p: number, step: number): number =>
      step > 0 ? Math.ceil(p) - p : p - Math.floor(p);

    let tMaxX = bound(origin.x, stepX) * tDeltaX;
    let tMaxY = bound(origin.y, stepY) * tDeltaY;
    let tMaxZ = bound(origin.z, stepZ) * tDeltaZ;

    let nx = 0;
    let ny = 0;
    let nz = 0;
    let t = 0;

    for (let i = 0; i < 512; i++) {
      const block = this.getBlock(x, y, z);
      if (block !== Block.AIR && blockDef(block).solid) {
        return {
          x,
          y,
          z,
          nx,
          ny,
          nz,
          block,
          distance: t,
          point: new THREE.Vector3(
            origin.x + direction.x * t,
            origin.y + direction.y * t,
            origin.z + direction.z * t,
          ),
        };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
      if (t > maxDistance) break;
    }
    return null;
  }

  /** Find the surface height (first air above the terrain) at a column. */
  surfaceHeight(x: number, z: number): number {
    for (let y = WORLD_Y - 1; y >= 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b !== Block.AIR && b !== Block.WATER && blockDef(b).solid) return y + 1;
    }
    return 1;
  }
}
