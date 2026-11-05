/**
 * Geometry probe: where do the triangles come from and how long does the
 * mesher take? Run with: node node_modules/.cache/geom.mjs
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!doctype html><html><body><div id="app"><canvas id="game-canvas"></canvas><div id="ui-root"></div>
   <div id="loading-screen"><div id="loading-fill"></div><div id="loading-status"></div><div id="loading-tip"></div></div></div></body></html>`,
  { pretendToBeVisual: true, url: 'http://localhost/?seed=424242' },
);
const { window } = dom;
const ctxMock: Record<string, unknown> = {};
for (const n of ['fillRect','clearRect','strokeRect','beginPath','closePath','moveTo','lineTo','arc','fill','stroke','save','restore','translate','rotate','scale','transform','setTransform','drawImage','putImageData','clip','rect','fillText','strokeText','setLineDash']) ctxMock[n] = () => undefined;
Object.assign(ctxMock, { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, imageSmoothingEnabled: false,
  createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  measureText: () => ({ width: 10 }) });
(window as unknown as { HTMLCanvasElement: unknown }).HTMLCanvasElement.prototype.getContext = () => ctxMock;
const g = globalThis as unknown as Record<string, unknown>;
g.window = window; g.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
for (const k of ['HTMLCanvasElement','Image','ImageData','HTMLElement','HTMLDivElement','SVGElement','HTMLInputElement','Event','CustomEvent','Blob','URL','Node','Element']) g[k] = (window as unknown as Record<string, unknown>)[k];
g.localStorage = window.localStorage;
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
g.devicePixelRatio = 1;

const { Game } = await import('../src/game/game');
const { buildChunkMesh } = await import('../src/world/mesher');
const { isOpaque, Block } = await import('../src/world/blocks');

const game = new Game(window.document.getElementById('app') as HTMLElement);
await game.boot();
const world = game.world;

// --- how many visible faces are there and where? ---
const FACES: Array<[number, number, number]> = [
  [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
];
let total = 0;
const bands = new Map<string, number>();
let blocks = 0;
for (let cz = 0; cz < 8; cz++) {
  for (let cx = 0; cx < 8; cx++) {
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const wx = cx * 16 + lx;
        const wz = cz * 16 + lz;
        const maxY = world.columnTop(wx, wz);
        for (let wy = 0; wy <= maxY; wy++) {
          const id = world.getBlock(wx, wy, wz);
          if (id === Block.AIR) continue;
          blocks++;
          const opaque = isOpaque(id);
          for (const [dx, dy, dz] of FACES) {
            const n = world.getBlock(wx + dx, wy + dy, wz + dz);
            if (opaque && isOpaque(n)) continue;
            if (!opaque && n === id) continue;
            total++;
            const band = `${Math.floor(wy / 8) * 8}-${Math.floor(wy / 8) * 8 + 7}`;
            bands.set(band, (bands.get(band) ?? 0) + 1);
          }
        }
      }
    }
  }
}
console.log(`solid blocks scanned: ${blocks}`);
console.log(`visible faces in the whole world: ${total} (${(total * 2)} triangles)`);
console.log('faces per y band:');
for (const [band, count] of [...bands.entries()].sort((a, b) => Number(a[0].split('-')[0]) - Number(b[0].split('-')[0]))) {
  const pct = ((count / total) * 100).toFixed(1);
  console.log(`  y ${band.padStart(7)}: ${String(count).padStart(7)} faces  ${pct}%`);
}

// --- mesher timing ---
const times: number[] = [];
for (let cz = 0; cz < 8; cz++) {
  for (let cx = 0; cx < 8; cx++) {
    const t0 = performance.now();
    const mesh = buildChunkMesh(world, cx, cz);
    times.push(performance.now() - t0);
    void mesh;
  }
}
times.sort((a, b) => a - b);
const totalMs = times.reduce((a, b) => a + b, 0);
console.log(`mesher: ${totalMs.toFixed(0)} ms for 64 chunks, median ${times[32]!.toFixed(2)} ms, max ${times[63]!.toFixed(2)} ms`);
process.exit(0);
