/**
 * Collision probe: walks the miner into a wall and reports every frame, so
 * the "glitching back and forth" can be seen.
 *
 *   npx esbuild scripts/collision-probe.ts --bundle --platform=node --format=esm \
 *     --outfile=.cache/collision.mjs --external:jsdom && node .cache/collision.mjs
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
const { Block } = await import('../src/world/blocks');
const { PLAYER } = await import('../src/core/constants');

const game = new Game(window.document.getElementById('app') as HTMLElement);
await game.boot();
const world = game.world;
const player = game.player;

// A flat spot in the middle of the map.
const px = 40.5;
const pz = 40.5;
const groundY = world.terrain.heightMap[40 + 40 * 128];

// A two block high wall right in front of the miner (facing -z).
for (let y = 1; y <= 2; y++) {
  for (let z = 36; z <= 38; z++) {
    world.setBlock(40, groundY + y, z, Block.STONE);
  }
}

player.pos.set(px, groundY + 1, pz);
player.vel.set(0, 0, 0);
player.yaw = 0; // look towards -z
player.pitch = 0;
player.dead = false;
player.health = player.maxHealth;

// Hold "forward" for a couple of seconds.
const input = game.input;
const state = input.state as unknown as { moveForward: number };
state.moveForward = 1;

const samples: Array<{ f: number; x: number; y: number; z: number; vy: number; ground: boolean }> = [];
for (let f = 0; f < 90; f++) {
  state.moveForward = 1;
  player.update(0.016, input);
  samples.push({
    f,
    x: player.pos.x,
    y: player.pos.y,
    z: player.pos.z,
    vy: player.vel.y,
    ground: player.onGround,
  });
}

console.log(`ground y=${groundY}, miner at ${px},${pz} walking into a wall at z=38`);
let flips = 0;
let yFlips = 0;
let lastZ = samples[0]!.z;
let lastY = samples[0]!.y;
let lastDir = 0;
for (const s of samples) {
  const dir = Math.sign(s.z - lastZ);
  if (dir !== 0) {
    if (lastDir !== 0 && dir !== lastDir) flips++;
    lastDir = dir;
  }
  if (Math.abs(s.y - lastY) > 0.2) yFlips++;
  lastZ = s.z;
  lastY = s.y;
}
for (const s of samples.slice(0, 40)) {
  console.log(
    `f=${String(s.f).padStart(3)} pos=(${s.x.toFixed(3)}, ${s.y.toFixed(3)}, ${s.z.toFixed(3)}) vy=${s.vy.toFixed(2)} ground=${s.ground}`,
  );
}
console.log(`\nz direction reversals: ${flips}`);
console.log(`y jumps (>0.2): ${yFlips}`);
process.exit(0);
