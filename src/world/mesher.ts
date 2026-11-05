import * as THREE from 'three';
import { blockDef, Block, isOpaque } from './blocks';
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

interface Buffers {
  position: number[];
  normal: number[];
  uv: number[];
  /** r = block light, g = sky light, b = shade * ao */
  light: number[];
  index: number[];
}

const newBuffers = (): Buffers => ({
  position: [],
  normal: [],
  uv: [],
  light: [],
  index: [],
});

function pushQuad(
  b: Buffers,
  world: World,
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

  for (let c = 0; c < 4; c++) {
    const corner = face.corners[c];
    const px = bx + corner[0];
    const py = by + corner[1];
    const pz = bz + corner[2];
    b.position.push(px, py, pz);
    b.normal.push(dx, dy, dz);

    const [tu, tv] = face.uvs[c];
    b.uv.push(u0 + du * tu, v0 + dv * (1 - tv));

    // --- ambient occlusion + smooth light ---
    const signU = corner[face.uAxis] > 0.5 ? 1 : -1;
    const signV = corner[face.vAxis] > 0.5 ? 1 : -1;
    const uOff: [number, number, number] = [0, 0, 0];
    uOff[face.uAxis] = signU;
    const vOff: [number, number, number] = [0, 0, 0];
    vOff[face.vAxis] = signV;

    const side1 = world.isOpaqueAt(px + dx + uOff[0], py + dy + uOff[1], pz + dz + uOff[2]);
    const side2 = world.isOpaqueAt(px + dx + vOff[0], py + dy + vOff[1], pz + dz + vOff[2]);
    const cornerOcc = world.isOpaqueAt(
      px + dx + uOff[0] + vOff[0],
      py + dy + uOff[1] + vOff[1],
      pz + dz + uOff[2] + vOff[2],
    );
    const s1 = side1 ? 1 : 0;
    const s2 = side2 ? 1 : 0;
    const sc = cornerOcc ? 1 : 0;
    const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + sc);
    const aoFactor = 0.52 + ao * 0.16;

    // Average light of the open cells touching this vertex.
    const lit = world.sampleLight(
      px + dx,
      py + dy,
      pz + dz,
      px + dx + uOff[0],
      py + dy + uOff[1],
      pz + dz + uOff[2],
      px + dx + vOff[0],
      py + dy + vOff[1],
      pz + dz + vOff[2],
      px + dx + uOff[0] + vOff[0],
      py + dy + uOff[1] + vOff[1],
      pz + dz + uOff[2] + vOff[2],
    );
    const shade = face.shade * aoFactor;
    b.light.push(lit.block / 15, lit.sky / 15, shade * baseBrightness);
  }

  b.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function toGeometry(b: Buffers): THREE.BufferGeometry | null {
  if (b.index.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('alight', new THREE.Float32BufferAttribute(b.light, 3));
  g.setIndex(b.index);
  g.computeBoundingSphere();
  return g;
}

/** Cross-shaped billboard geometry for plants and torches. */
function pushCross(
  b: Buffers,
  world: World,
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

  const light = world.sampleLight(bx, by, bz);
  const brightness = baseBrightness * 0.95;
  const l = [light.block / 15, light.sky / 15, brightness];

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
      b.position.push(px, py, pz);
      b.normal.push(plane.nx, 0, plane.nz);
      b.uv.push(u0 + du * tu, v0 + dv * tv);
      b.light.push(l[0], l[1], l[2]);
    }
    b.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
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

  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const wx = x0 + lx;
      const wz = z0 + lz;
      const maxY = world.columnTop(wx, wz);
      for (let wy = 0; wy <= maxY; wy++) {
        const id = world.getBlock(wx, wy, wz);
        if (id === Block.AIR) continue;
        const def = blockDef(id);

        if (def.render === 'cross' || def.render === 'torch') {
          const scale = def.render === 'torch' ? 0.34 : 1;
          const height = def.render === 'torch' ? 0.95 : 1;
          pushCross(cutout, world, wx, wy, wz, def.side, scale, height, 1);
          continue;
        }

        const target = def.liquid ? liquid : def.cutout ? cutout : opaque;
        for (const face of FACES) {
          const nx = wx + face.dir[0];
          const ny = wy + face.dir[1];
          const nz = wz + face.dir[2];
          const neighbour = world.getBlock(nx, ny, nz);
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
          pushQuad(target, world, wx, wy, wz, face, tile, 1);
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
