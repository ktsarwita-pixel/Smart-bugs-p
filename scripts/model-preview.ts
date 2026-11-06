/**
 * Model preview: draws the 3D characters with a tiny software rasteriser so
 * the models can be checked without a browser or a GPU.
 *
 *   npx esbuild scripts/model-preview.ts --bundle --platform=node --format=esm \
 *     --outfile=.cache/models.mjs --external:jsdom --external:three && node .cache/models.mjs
 *
 * Writes `.cache/miner.png`, `.cache/robot.png` and `.cache/mobs.png`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { bootDom, encodePng, type MockContext } from './sprite-harness';

const { contexts } = await bootDom();

mkdirSync(resolve(process.cwd(), '.cache'), { recursive: true });

/* ------------------------------------------------------------------ */
/* A very small z-buffered triangle rasteriser                        */
/* ------------------------------------------------------------------ */

interface Frame {
  w: number;
  h: number;
  color: Uint8ClampedArray;
  depth: Float32Array;
}

const newFrame = (w: number, h: number): Frame => ({
  w,
  h,
  color: new Uint8ClampedArray(w * h * 4),
  depth: new Float32Array(w * h).fill(Infinity),
});

function fillBackground(frame: Frame, r: number, g: number, b: number): void {
  for (let i = 0; i < frame.w * frame.h; i++) {
    frame.color[i * 4] = r;
    frame.color[i * 4 + 1] = g;
    frame.color[i * 4 + 2] = b;
    frame.color[i * 4 + 3] = 255;
  }
}

function triangle(
  frame: Frame,
  p: Array<[number, number, number]>,
  rgb: [number, number, number],
): void {
  const [a, b, c] = p;
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-9) return;
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxX = Math.min(frame.w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxY = Math.min(frame.h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])) / area;
      const w1 = ((c[0] - b[0]) * (py - b[1]) - (c[1] - b[1]) * (px - b[0])) / area;
      const w2 = ((a[0] - c[0]) * (py - c[1]) - (a[1] - c[1]) * (px - c[0])) / area;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w1 * a[2] + w2 * b[2] + w0 * c[2];
      const i = y * frame.w + x;
      if (z >= frame.depth[i]!) continue;
      frame.depth[i] = z;
      frame.color[i * 4] = rgb[0];
      frame.color[i * 4 + 1] = rgb[1];
      frame.color[i * 4 + 2] = rgb[2];
      frame.color[i * 4 + 3] = 255;
    }
  }
}

/** Renders a three.js object with a simple headlight. */
function render(object: THREE.Object3D, size: number, eye: THREE.Vector3): Frame {
  const frame = newFrame(size, size);
  fillBackground(frame, 38, 40, 46);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.copy(eye);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld(true);
  object.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).geometry) meshes.push(child as THREE.Mesh);
  });

  const v = new THREE.Vector3();
  const camPos = camera.position;
  for (const mesh of meshes) {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const material = mesh.material as THREE.MeshBasicMaterial;
    const base = material.color;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      const tri: Array<[number, number, number]> = [];
      for (let k = 0; k < 3; k++) {
        const vi = index ? index.getX(i + k) : i + k;
        v.fromBufferAttribute(position, vi);
        mesh.localToWorld(v);
        const world = v.clone();
        v.copy(world).project(camera);
        const z = world.distanceTo(camPos);
        tri.push([(v.x * 0.5 + 0.5) * size, (-v.y * 0.5 + 0.5) * size, z]);
      }
      // A cheap directional light from the upper left.
      const nx = tri[1]![0] - tri[0]![0];
      const ny = tri[1]![1] - tri[0]![1];
      const nz = tri[1]![2] - tri[0]![2];
      const mx = tri[2]![0] - tri[0]![0];
      const my = tri[2]![1] - tri[0]![1];
      const mz = tri[2]![2] - tri[0]![2];
      let cx = ny * mz - nz * my;
      let cy = nz * mx - nx * mz;
      let cz = nx * my - ny * mx;
      const len = Math.hypot(cx, cy, cz) || 1;
      cx /= len;
      cy /= len;
      cz /= len;
      const light = Math.max(0.28, Math.min(1, -cx * 0.4 - cy * 0.6 - cz * 0.7 + 0.55));
      triangle(frame, tri, [
        Math.round(base.r * 255 * light),
        Math.round(base.g * 255 * light),
        Math.round(base.b * 255 * light),
      ]);
    }
  }
  return frame;
}

function save(frame: Frame, name: string): void {
  const file = resolve(process.cwd(), `.cache/${name}.png`);
  writeFileSync(file, encodePng(frame.w, frame.h, frame.color));
  console.log(`${name}.png  ${frame.w}x${frame.h}`);
}

/* ------------------------------------------------------------------ */
/* The models                                                          */
/* ------------------------------------------------------------------ */

const { createMinerModel, createRobotModel, setHeldTool } = await import('../src/entities/models');
const { createMobModel } = await import('../src/entities/mobs');

const SIZE = 260;

// The miner, from the front and from the side.
const miner = createMinerModel();
setHeldTool(miner, 'pickaxe_iron');
save(render(miner.group, SIZE, new THREE.Vector3(2.4, 2.0, 3.2)), 'miner');
miner.group.rotation.y = Math.PI / 2;
save(render(miner.group, SIZE, new THREE.Vector3(2.4, 2.0, 3.2)), 'miner-side');

// BOLT-7.
const robot = createRobotModel();
save(render(robot.group, SIZE, new THREE.Vector3(2.4, 2.0, 3.2)), 'robot');
robot.group.rotation.y = Math.PI / 2;
save(render(robot.group, SIZE, new THREE.Vector3(2.4, 2.0, 3.2)), 'robot-side');

// The cave dwellers.
const crawler = createMobModel('crawler');
save(render(crawler.group, SIZE, new THREE.Vector3(2.0, 1.4, 2.8)), 'crawler');
const magmite = createMobModel('magmite');
save(render(magmite.group, SIZE, new THREE.Vector3(2.0, 1.4, 2.8)), 'magmite');

void contexts;
process.exit(0);
