import * as THREE from 'three';
import { blockDef, Block, isOpaque } from './blocks';
import { WORLD_X, WORLD_Y, WORLD_Z } from '../core/constants';
import { tileUV } from '../render/textures';
import type { World } from './world';

interface FaceDef {
  dir: [number, number, number];
  corners: Array<[number, number, number]>;
  uvs: Array<[number, number]>;
  /** Axis index used for the horizontal tangent (0=x, 2=z). */
  uAxis: 0 | 1 | 2;
  /** Axis index used for the vertical tangent (1=y). */
  vAxis: 0 | 1 | 2;
  shade: number;
  pick: 'top' | 'bottom' | 'side';
}

const FACES: FaceDef[] = [
  {
    dir: [0, 1, 0],
    corners: [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
    uvs: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ],
    uAxis: 0,
    vAxis: 2,
    shade: 1.0,
    pick: 'top',
  },
  {
    dir: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    uvs: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    uAxis: 0,
    vAxis: 2,
    shade: 0.48,
    pick: 'bottom',
  },
  {
    dir: [1, 0, 0],
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
    uvs: [
      [0, 1],
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    uAxis: 2,
    vAxis: 1,
    shade: 0.62,
    pick: 'side',
  },
  {
    dir: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    uvs: [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
    uAxis: 2,
    vAxis: 1,
    shade: 0.62,
    pick: 'side',
  },
  {
    dir: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    uvs: [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
    uAxis: 0,
    vAxis: 1,
    shade: 0.82,
    pick: 'side',
  },
  {
    dir: [0, 0, -1],
    corners: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
    uvs: [
      [0, 1],
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    uAxis: 0,
    vAxis: 1,
    shade: 0.82,
    pick: 'side',
  },
];

export interface ChunkMeshData {
  opaque: THREE.BufferGeometry | null;
  cutout: THREE.BufferGeometry | null;
  liquid: THREE.BufferGeometry | null;
}

/**
 * A growable float buffer.
 *
 * The mesher writes millions of numbers per world. Plain arrays mean a lot of
 * garbage collector work, so the vertices live in typed arrays that are
 * reallocated rarely.
 */
class FloatBuffer {
  data: Float32Array;
  length = 0;

  constructor(capacity = 8192) {
    this.data = new Float32Array(capacity);
  }

  private ensure(extra: number): void {
    if (this.length + extra <= this.data.length) return;
    let size = this.data.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Float32Array(size);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }

  push1(a: number): void {
    this.ensure(1);
    this.data[this.length++] = a;
  }

  push2(a: number, b: number): void {
    this.ensure(2);
    this.data[this.length++] = a;
    this.data[this.length++] = b;
  }

  push3(a: number, b: number, c: number): void {
    this.ensure(3);
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
  }

  /** The used part of the buffer. */
  view(): Float32Array {
    return this.data.subarray(0, this.length);
  }
}

/** A growable index buffer. */
class IndexBuffer {
  data: Uint32Array;
  length = 0;

  constructor(capacity = 8192) {
    this.data = new Uint32Array(capacity);
  }

  private ensure(extra: number): void {
    if (this.length + extra <= this.data.length) return;
    let size = this.data.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint32Array(size);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }

  push6(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ensure(6);
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
    this.data[this.length++] = d;
    this.data[this.length++] = e;
    this.data[this.length++] = f;
  }

  view(): Uint32Array {
    return this.data.subarray(0, this.length);
  }
}

interface Buffers {
  position: FloatBuffer;
  normal: FloatBuffer;
  uv: FloatBuffer;
  /** r = block light, g = sky light, b = shade * ao */
  light: FloatBuffer;
  index: IndexBuffer;
}

/**
 * A padded snapshot of the blocks around a chunk.
 *
 * The mesher used to ask the world for every neighbour of every block, which
 * meant hundreds of thousands of bounds-checked lookups per chunk. Reading the
 * padded arrays directly is several times faster and keeps the frame budget
 * free for the game itself.
 */
const PAD = 2;
const CACHE_X = 16 + PAD * 2;
const CACHE_Z = 16 + PAD * 2;
const CACHE_Y = WORLD_Y;

interface ChunkCache {
  /** Block ids. */
  blocks: Uint8Array;
  /** 1 when the block hides the faces behind it. */
  opaque: Uint8Array;
  sky: Uint8Array;
  block: Uint8Array;
  /** World x of the local origin. */
  ox: number;
  oz: number;
}

const cacheBlocks = new Uint8Array(CACHE_X * CACHE_Y * CACHE_Z);
const cacheOpaque = new Uint8Array(CACHE_X * CACHE_Y * CACHE_Z);
const cacheSky = new Uint8Array(CACHE_X * CACHE_Y * CACHE_Z);
const cacheBlockLight = new Uint8Array(CACHE_X * CACHE_Y * CACHE_Z);
const chunkCache: ChunkCache = {
  blocks: cacheBlocks,
  opaque: cacheOpaque,
  sky: cacheSky,
  block: cacheBlockLight,
  ox: 0,
  oz: 0,
};

function cacheIndex(x: number, y: number, z: number): number {
  return (y * CACHE_Z + z) * CACHE_X + x;
}

/** Fill the padded snapshot for the chunk at (cx, cz). */
function fillCache(world: World, cx: number, cz: number): void {
  const ox = cx * 16 - PAD;
  const oz = cz * 16 - PAD;
  chunkCache.ox = ox;
  chunkCache.oz = oz;
  for (let y = 0; y < CACHE_Y; y++) {
    for (let z = 0; z < CACHE_Z; z++) {
      const wz = oz + z;
      const rowBase = (y * CACHE_Z + z) * CACHE_X;
      for (let x = 0; x < CACHE_X; x++) {
        const wx = ox + x;
        const i = rowBase + x;
        if (wx < 0 || wz < 0 || wx >= WORLD_X || wz >= WORLD_Z) {
          // Outside the map the world reports air, so the border keeps the
          // same open edges it always had.
          cacheBlocks[i] = Block.AIR;
          cacheOpaque[i] = 0;
          cacheSky[i] = 0;
          cacheBlockLight[i] = 0;
          continue;
        }
        const id = world.getBlock(wx, y, wz);
        cacheBlocks[i] = id;
        cacheOpaque[i] = isOpaque(id) ? 1 : 0;
        const li = world.indexOf(wx, y, wz);
        cacheSky[i] = world.skyLight[li];
        cacheBlockLight[i] = world.blockLight[li];
      }
    }
  }
}

/** Is the cell at local (x, y, z) opaque? Handles the vertical bounds. */
function cacheOpaqueAt(x: number, y: number, z: number): boolean {
  if (y < 0 || y >= CACHE_Y) return true;
  if (x < 0 || x >= CACHE_X || z < 0 || z >= CACHE_Z) return true;
  return cacheOpaque[cacheIndex(x, y, z)] === 1;
}

const newBuffers = (): Buffers => ({
  position: new FloatBuffer(),
  normal: new FloatBuffer(),
  uv: new FloatBuffer(),
  light: new FloatBuffer(),
  index: new IndexBuffer(),
});

function pushQuad(
  b: Buffers,
  bx: number,
  by: number,
  bz: number,
  face: FaceDef,
  tile: number,
  baseBrightness: number,
): void {
  const [u0, v0, du, dv] = tileUV(tile);
  const base = b.position.length / 3;
  const [dx, dy, dz] = face.dir;
  // Local (padded) coordinates of the block.
  const lx = bx - chunkCache.ox;
  const lz = bz - chunkCache.oz;

  for (let c = 0; c < 4; c++) {
    const corner = face.corners[c];
    const px = bx + corner[0];
    const py = by + corner[1];
    const pz = bz + corner[2];
    b.position.push3(px, py, pz);
    b.normal.push3(dx, dy, dz);

    const [tu, tv] = face.uvs[c];
    b.uv.push2(u0 + du * tu, v0 + dv * (1 - tv));

    // --- ambient occlusion + smooth light ---
    const signU = corner[face.uAxis] > 0.5 ? 1 : -1;
    const signV = corner[face.vAxis] > 0.5 ? 1 : -1;
    const uOff: [number, number, number] = [0, 0, 0];
    uOff[face.uAxis] = signU;
    const vOff: [number, number, number] = [0, 0, 0];
    vOff[face.vAxis] = signV;

    const ax = lx + corner[0];
    const ay = py;
    const az = lz + corner[2];

    const side1 = cacheOpaqueAt(ax + dx + uOff[0], ay + dy + uOff[1], az + dz + uOff[2]);
    const side2 = cacheOpaqueAt(ax + dx + vOff[0], ay + dy + vOff[1], az + dz + vOff[2]);
    const cornerOcc = cacheOpaqueAt(
      ax + dx + uOff[0] + vOff[0],
      ay + dy + uOff[1] + vOff[1],
      az + dz + uOff[2] + vOff[2],
    );
    const s1 = side1 ? 1 : 0;
    const s2 = side2 ? 1 : 0;
    const sc = cornerOcc ? 1 : 0;
    const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + sc);
    const aoFactor = 0.52 + ao * 0.16;

    // Average light of the open cells touching this vertex.
    let sky = 0;
    let block = 0;
    let count = 0;
    const addLight = (cx: number, cy: number, cz: number): void => {
      if (cy < 0 || cy >= CACHE_Y) return;
      if (cx < 0 || cx >= CACHE_X || cz < 0 || cz >= CACHE_Z) return;
      const i = cacheIndex(cx, cy, cz);
      if (cacheOpaque[i] === 1) return;
      sky += cacheSky[i];
      block += cacheBlockLight[i];
      count++;
    };
    addLight(ax + dx, ay + dy, az + dz);
    addLight(ax + dx + uOff[0], ay + dy + uOff[1], az + dz + uOff[2]);
    addLight(ax + dx + vOff[0], ay + dy + vOff[1], az + dz + vOff[2]);
    addLight(
      ax + dx + uOff[0] + vOff[0],
      ay + dy + uOff[1] + vOff[1],
      az + dz + uOff[2] + vOff[2],
    );
    if (count === 0) {
      const ci = cacheIndex(
        Math.min(Math.max(ax + dx, 0), CACHE_X - 1),
        Math.min(Math.max(ay + dy, 0), CACHE_Y - 1),
        Math.min(Math.max(az + dz, 0), CACHE_Z - 1),
      );
      sky = cacheSky[ci];
      block = cacheBlockLight[ci];
    } else {
      sky /= count;
      block /= count;
    }
    // A little per-block variation, so a wall of stone is not perfectly flat.
    const hash = ((bx * 73856093) ^ (by * 19349663) ^ (bz * 83492791)) >>> 0;
    const jitter = 0.93 + ((hash & 255) / 255) * 0.14;
    const shade = face.shade * aoFactor * jitter;
    b.light.push3(block / 15, sky / 15, shade * baseBrightness);
  }

  b.index.push6(base, base + 1, base + 2, base, base + 2, base + 3);
}

function toGeometry(b: Buffers): THREE.BufferGeometry | null {
  if (b.index.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.position.view(), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(b.normal.view(), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(b.uv.view(), 2));
  g.setAttribute('alight', new THREE.BufferAttribute(b.light.view(), 3));
  g.setIndex(new THREE.BufferAttribute(b.index.view(), 1));
  g.computeBoundingSphere();
  return g;
}

/** Cross-shaped billboard geometry for plants and torches. */
function pushCross(
  b: Buffers,
  bx: number,
  by: number,
  bz: number,
  tile: number,
  scaleX: number,
  scaleY: number,
  baseBrightness: number,
): void {
  const [u0, v0, du, dv] = tileUV(tile);
  const cx = bx + 0.5;
  const cz = bz + 0.5;
  const half = scaleX / 2;
  const y0 = by + 0.02;
  const y1 = by + scaleY;

  const lx = bx - chunkCache.ox;
  const lz = bz - chunkCache.oz;
  let sky = 0;
  let block = 0;
  if (by >= 0 && by < CACHE_Y && lx >= 0 && lx < CACHE_X && lz >= 0 && lz < CACHE_Z) {
    const i = cacheIndex(lx, by, lz);
    sky = cacheSky[i];
    block = cacheBlockLight[i];
  }
  const brightness = baseBrightness * 0.95;
  const l = [block / 15, sky / 15, brightness];

  const planes: Array<{ ax: number; az: number; nx: number; nz: number }> = [
    { ax: half, az: half, nx: 0.7071, nz: 0.7071 },
    { ax: half, az: -half, nx: -0.7071, nz: 0.7071 },
  ];

  for (const plane of planes) {
    const base = b.position.length / 3;
    const quad: Array<[number, number, number, number, number]> = [
      [cx - plane.ax, y0, cz - plane.az, 0, 1],
      [cx + plane.ax, y0, cz + plane.az, 1, 1],
      [cx + plane.ax, y1, cz + plane.az, 1, 0],
      [cx - plane.ax, y1, cz - plane.az, 0, 0],
    ];
    for (const [px, py, pz, tu, tv] of quad) {
      b.position.push3(px, py, pz);
      b.normal.push3(plane.nx, 0, plane.nz);
      b.uv.push2(u0 + du * tu, v0 + dv * tv);
      b.light.push3(l[0], l[1], l[2]);
    }
    b.index.push6(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/**
 * A thin post for torches: two pixels wide and ten pixels tall, standing in
 * the middle of the block.
 *
 * Torches used to be drawn as a cross of two diagonal quads, which turned
 * the vertical torch sprite into a leaning stick. The post shows the middle
 * two columns of the tile on its sides and the flame on its top.
 */
function pushPost(
  b: Buffers,
  bx: number,
  by: number,
  bz: number,
  tile: number,
  baseBrightness: number,
): void {
  const [u0, v0, du, dv] = tileUV(tile);
  const w = 2 / 16;
  const h = 10 / 16;
  const x0 = bx + 7 / 16;
  const x1 = x0 + w;
  const z0 = bz + 7 / 16;
  const z1 = z0 + w;
  const y0 = by;
  const y1 = by + h;

  // The post shows the middle two columns of the tile.
  const uu0 = u0 + du * (7 / 16);
  const uu1 = uu0 + du * (2 / 16);
  const vv0 = v0;
  const vv1 = v0 + dv;
  // The top of the post shows the flame.
  const flameV0 = v0 + dv * 0.5;
  const flameV1 = v0 + dv * 0.875;

  const lx = bx - chunkCache.ox;
  const lz = bz - chunkCache.oz;
  let sky = 0;
  let block = 0;
  if (by >= 0 && by < CACHE_Y && lx >= 0 && lx < CACHE_X && lz >= 0 && lz < CACHE_Z) {
    const i = cacheIndex(lx, by, lz);
    sky = cacheSky[i];
    block = cacheBlockLight[i];
  }
  const l = [block / 15, sky / 15, baseBrightness * 0.95];

  const faces: Array<{
    n: [number, number, number];
    pts: Array<[number, number, number, number, number]>;
  }> = [
    {
      n: [0, 0, -1],
      pts: [
        [x0, y0, z0, uu0, vv0],
        [x0, y1, z0, uu0, vv1],
        [x1, y1, z0, uu1, vv1],
        [x1, y0, z0, uu1, vv0],
      ],
    },
    {
      n: [0, 0, 1],
      pts: [
        [x1, y0, z1, uu0, vv0],
        [x1, y1, z1, uu0, vv1],
        [x0, y1, z1, uu1, vv1],
        [x0, y0, z1, uu1, vv0],
      ],
    },
    {
      n: [-1, 0, 0],
      pts: [
        [x0, y0, z1, uu0, vv0],
        [x0, y1, z1, uu0, vv1],
        [x0, y1, z0, uu1, vv1],
        [x0, y0, z0, uu1, vv0],
      ],
    },
    {
      n: [1, 0, 0],
      pts: [
        [x1, y0, z0, uu0, vv0],
        [x1, y1, z0, uu0, vv1],
        [x1, y1, z1, uu1, vv1],
        [x1, y0, z1, uu1, vv0],
      ],
    },
    {
      n: [0, 1, 0],
      pts: [
        [x0, y1, z1, uu0, flameV1],
        [x1, y1, z1, uu1, flameV1],
        [x1, y1, z0, uu1, flameV0],
        [x0, y1, z0, uu0, flameV0],
      ],
    },
  ];

  for (const f of faces) {
    const base = b.position.length / 3;
    for (const [px, py, pz, u, v] of f.pts) {
      b.position.push3(px, py, pz);
      b.normal.push3(f.n[0], f.n[1], f.n[2]);
      b.uv.push2(u, v);
      b.light.push3(l[0], l[1], l[2]);
    }
    b.index.push6(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/**
 * Build the geometry for one chunk column.
 * Returns three geometries: opaque, cutout (leaves/glass/plants) and liquid.
 */
export function buildChunkMesh(world: World, cx: number, cz: number): ChunkMeshData {
  const opaque = newBuffers();
  const cutout = newBuffers();
  const liquid = newBuffers();

  const x0 = cx * 16;
  const z0 = cz * 16;

  fillCache(world, cx, cz);

  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const wx = x0 + lx;
      const wz = z0 + lz;
      const maxY = world.columnTop(wx, wz);
      for (let wy = 0; wy <= maxY; wy++) {
        const id = cacheBlocks[cacheIndex(lx + PAD, wy, lz + PAD)];
        if (id === Block.AIR) continue;
        const def = blockDef(id);

        if (def.render === 'torch') {
          pushPost(cutout, wx, wy, wz, def.side, 1);
          continue;
        }
        if (def.render === 'cross') {
          pushCross(cutout, wx, wy, wz, def.side, 1, 1, 1);
          continue;
        }

        const target = def.liquid ? liquid : def.cutout ? cutout : opaque;
        for (const face of FACES) {
          const ny = wy + face.dir[1];
          const neighbour = cacheBlocks[cacheIndex(lx + PAD + face.dir[0], ny, lz + PAD + face.dir[2])];
          if (neighbour === Block.AIR) {
            // visible
          } else if (def.liquid) {
            if (neighbour === id) continue;
            if (isOpaque(neighbour)) continue;
          } else if (def.cutout) {
            if (neighbour === id) continue;
            if (isOpaque(neighbour)) continue;
          } else {
            if (isOpaque(neighbour)) continue;
            if (neighbour === id && !def.liquid) {
              // Same non-opaque block: hide shared faces (glass/foliage).
              continue;
            }
          }

          const tile =
            face.pick === 'top' ? def.top : face.pick === 'bottom' ? def.bottom : def.side;
          pushQuad(target, wx, wy, wz, face, tile, 1);
        }
      }
    }
  }

  return {
    opaque: toGeometry(opaque),
    cutout: toGeometry(cutout),
    liquid: toGeometry(liquid),
  };
}
