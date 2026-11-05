/**
 * Performance probe: boots the real game headlessly and measures where the
 * frame time goes, plus the size of the render payload (chunks, triangles,
 * draw calls) that the browser has to push through the GPU.
 *
 * Run with: npm run perf
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `<!doctype html><html><body>
     <div id="app">
       <canvas id="game-canvas"></canvas>
       <div id="ui-root"></div>
       <div id="loading-screen"><div id="loading-fill"></div><div id="loading-status"></div><div id="loading-tip"></div></div>
       <div id="orientation-nudge" hidden></div>
     </div>
   </body></html>`,
  { pretendToBeVisual: true, url: 'http://localhost/?seed=424242' },
);
const { window } = dom;

const ctxMock: Record<string, unknown> = {};
for (const name of [
  'fillRect', 'clearRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc',
  'fill', 'stroke', 'save', 'restore', 'translate', 'rotate', 'scale', 'transform', 'setTransform',
  'drawImage', 'putImageData', 'clip', 'rect', 'fillText', 'strokeText', 'setLineDash',
]) {
  ctxMock[name] = () => undefined;
}
ctxMock.fillStyle = '#000';
ctxMock.strokeStyle = '#000';
ctxMock.lineWidth = 1;
ctxMock.globalAlpha = 1;
ctxMock.imageSmoothingEnabled = false;
ctxMock.createImageData = (w: number, h: number) => ({
  width: w,
  height: h,
  data: new Uint8ClampedArray(w * h * 4),
});
ctxMock.getImageData = (_x: number, _y: number, w: number, h: number) => ({
  width: w,
  height: h,
  data: new Uint8ClampedArray(w * h * 4),
});
ctxMock.measureText = () => ({ width: 10 });

(window as unknown as { HTMLCanvasElement: unknown }).HTMLCanvasElement.prototype.getContext = () => ctxMock;
(window as unknown as { HTMLCanvasElement: unknown }).HTMLCanvasElement.prototype.toDataURL = () =>
  'data:image/png;base64,iVBORw0KGgo=';

const globals = globalThis as unknown as Record<string, unknown>;
globals.window = window;
globals.document = window.document;
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: window.navigator,
    configurable: true,
    writable: true,
  });
} catch {
  /* ignore */
}
globals.HTMLCanvasElement = window.HTMLCanvasElement;
globals.Image = window.Image;
globals.ImageData = window.ImageData;
globals.HTMLElement = window.HTMLElement;
globals.HTMLDivElement = window.HTMLDivElement;
globals.HTMLCanvasElement = window.HTMLCanvasElement;
globals.SVGElement = window.SVGElement;
globals.Event = window.Event;
globals.CustomEvent = window.CustomEvent;
globals.localStorage = window.localStorage;
globals.Blob = window.Blob;
globals.URL = window.URL;
globals.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globals.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globals.devicePixelRatio = 1;

const { Game } = await import('../src/game/game');

const t0 = performance.now();
const game = new Game(window.document.getElementById('app') as HTMLElement);
await game.boot();
const bootMs = performance.now() - t0;

console.log(`boot: ${bootMs.toFixed(0)} ms`);
console.log(`graphicsAvailable: ${game.graphicsAvailable}`);
console.log(`render distance: ${game.settings.renderDistance} chunks`);

/* ------------------------------------------------------------------ */
/* Render payload                                                      */
/* ------------------------------------------------------------------ */
interface MeshStats {
  chunks: number;
  triangles: number;
  vertices: number;
  opaqueMeshes: number;
}
// Force-build every chunk so the measurement reflects the full render payload.
const world0 = game.world;
const buildAllStart = performance.now();
for (const c of world0.listChunks()) world0.rebuildChunk(c.cx, c.cz);
const buildAllMs = performance.now() - buildAllStart;

const stats: MeshStats = { chunks: 0, triangles: 0, vertices: 0, opaqueMeshes: 0 };
const scene = (game as unknown as { scene: { traverse: (cb: (o: unknown) => void) => void } }).scene;
scene.traverse((obj) => {
  const mesh = obj as {
    isMesh?: boolean;
    geometry?: { index?: { count: number }; attributes?: { position?: { count: number } } };
  };
  if (!mesh.isMesh || !mesh.geometry) return;
  const index = mesh.geometry.index;
  const position = mesh.geometry.attributes?.position;
  const tris = index ? index.count / 3 : (position ? position.count / 3 : 0);
  stats.triangles += tris;
  stats.vertices += position?.count ?? 0;
  stats.opaqueMeshes++;
});
const world = game.world;
const chunks = world.listChunks();
stats.chunks = chunks.length;
console.log(
  `render payload: ${stats.chunks} chunks, ${stats.opaqueMeshes} meshes, ` +
    `${stats.triangles.toLocaleString()} triangles, ${stats.vertices.toLocaleString()} vertices`,
);
console.log(`full build of ${stats.chunks} chunks: ${buildAllMs.toFixed(0)} ms`);

/* ------------------------------------------------------------------ */
/* Frame timing                                                        */
/* ------------------------------------------------------------------ */
const FRAMES = 240;
const samples: number[] = [];
let last = performance.now();
await new Promise<void>((resolve) => {
  let n = 0;
  const tick = (): void => {
    const now = performance.now();
    samples.push(now - last);
    last = now;
    n++;
    if (n >= FRAMES) {
      resolve();
      return;
    }
    window.setTimeout(tick, 0);
  };
  window.setTimeout(tick, 0);
});
samples.sort((a, b) => a - b);
const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
console.log(
  `frame interval: mean ${mean.toFixed(2)} ms, p50 ${samples[Math.floor(samples.length / 2)].toFixed(2)} ms, ` +
    `p95 ${samples[Math.floor(samples.length * 0.95)].toFixed(2)} ms, max ${samples[samples.length - 1].toFixed(2)} ms`,
);

/* ------------------------------------------------------------------ */
/* Subsystem timing (direct calls)                                     */
/* ------------------------------------------------------------------ */
const g = game as unknown as {
  player: { update: (dt: number, input: unknown) => void };
  robot: { update: (dt: number) => void };
  mobs: { update: (dt: number) => void };
  items: { update: (dt: number) => void };
  particles: { update: (dt: number) => void };
  hud: { update: (dt: number, fps: number) => void };
  minimap: { render: (g: unknown) => void };
};
const input = (game as unknown as { input: unknown }).input;
const timeIt = (label: string, fn: () => void, n = 120): void => {
  const t = performance.now();
  for (let i = 0; i < n; i++) fn();
  const ms = (performance.now() - t) / n;
  console.log(`  ${label}: ${ms.toFixed(3)} ms/call`);
};

console.log('subsystems:');
timeIt('player.update', () => g.player.update(0.016, input));
timeIt('robot.update', () => g.robot.update(0.016));
timeIt('mobs.update', () => g.mobs.update(0.016));
timeIt('items.update', () => g.items.update(0.016));
timeIt('particles.update', () => g.particles.update(0.016));
timeIt('hud.update', () => g.hud.update(0.016, 60));
timeIt('minimap.render', () => g.minimap.render(game), 30);
timeIt('world.rebuildChunk', () => {
  const c = chunks[Math.floor(chunks.length / 2)];
  if (c) {
    c.dirty = true;
    world.rebuildChunk(c.cx, c.cz);
  }
}, 20);

process.exit(0);
