/**
 * Step probe: walks the miner into ledges and walls and reports the
 * trajectory, so the "jumps automatically" and "glitches back and forth"
 * problems can be seen frame by frame.
 *
 *   npx esbuild scripts/step-probe.ts --bundle --platform=node --format=esm \
 *     --outfile=.cache/step.mjs --external:jsdom && node .cache/step.mjs
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

const game = new Game(window.document.getElementById('app') as HTMLElement);
await game.boot();
const world = game.world;
const player = game.player;
const input = game.input;
const state = input.state as unknown as { moveForward: number };

const PX = 40;
const PZ = 60;
const GROUND = world.terrain.heightMap[PX + PZ * 128];

function clearArea(x: number, z: number, r: number): void {
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      // Flatten the ground so the surface sits at GROUND.
      world.setBlock(x + dx, GROUND - 1, z + dz, Block.STONE);
      for (let dy = 0; dy <= 5; dy++) world.setBlock(x + dx, GROUND + dy, z + dz, Block.AIR);
    }
  }
}

/** Places a wall of `height` blocks in front of the miner (towards -z). */
function buildWall(z: number, height: number): void {
  // The ground surface sits at GROUND, so the first block of the wall is the
  // one at GROUND (it stands on the surface and its top is GROUND + 1).
  for (let y = 0; y < height; y++) {
    for (let dz = 0; dz < 3; dz++) world.setBlock(PX, GROUND + y, z - dz, Block.STONE);
  }
}

interface Track {
  reversals: number;
  yJumps: number;
  maxRise: number;
  frames: Array<{ f: number; x: number; y: number; z: number; vy: number; ground: boolean; climb?: boolean; target?: number }>;
}

function walk(frames: number): Track {
  player.pos.set(PX + 0.5, GROUND + 1, PZ + 0.5);
  player.vel.set(0, 0, 0);
  player.yaw = 0;
  player.pitch = 0;
  player.dead = false;
  player.health = player.maxHealth;
  player.onGround = true;

  const track: Track = { reversals: 0, yJumps: 0, maxRise: 0, frames: [] };
  let lastZ = player.pos.z;
  let lastY = player.pos.y;
  let lastDir = 0;
  for (let f = 0; f < frames; f++) {
    state.moveForward = 1;
    player.update(0.016, input);
    const s = {
      f,
      x: player.pos.x,
      y: player.pos.y,
      z: player.pos.z,
      vy: player.vel.y,
      ground: player.onGround,
    };
    s.climb = player.stepState.climbing;
    s.target = player.stepState.targetY;
    track.frames.push(s);
    const dir = Math.sign(s.z - lastZ);
    if (dir !== 0) {
      if (lastDir !== 0 && dir !== lastDir) track.reversals++;
      lastDir = dir;
    }
    if (s.y - lastY > track.maxRise) track.maxRise = s.y - lastY;
    if (Math.abs(s.y - lastY) > 0.2) track.yJumps++;
    lastZ = s.z;
    lastY = s.y;
  }
  return track;
}

function report(name: string, track: Track, show = 24): void {
  console.log(`\n=== ${name} ===`);
  for (const s of track.frames.slice(0, show)) {
    console.log(
      `f=${String(s.f).padStart(3)} pos=(${s.x.toFixed(3)}, ${s.y.toFixed(3)}, ${s.z.toFixed(3)}) vy=${s.vy.toFixed(2)} ground=${s.ground} climb=${s.climb ? 'Y' : 'n'} target=${(s.target ?? 0).toFixed(2)}`,
    );
  }
  const last = track.frames[track.frames.length - 1]!;
  console.log(
    `end pos=(${last.x.toFixed(2)}, ${last.y.toFixed(2)}, ${last.z.toFixed(2)}) reversals=${track.reversals} yJumps=${track.yJumps} maxRise=${track.maxRise.toFixed(3)}`,
  );
}

// --- 1. one block ledge -------------------------------------------------
clearArea(PX, PZ, 6);
buildWall(PZ - 4, 1);
report('one block ledge', walk(120), 120);

// --- 2. two block wall --------------------------------------------------
clearArea(PX, PZ, 6);
buildWall(PZ - 4, 2);
report('two block wall', walk(60));

// --- 3. three block wall (too tall to step) ----------------------------
clearArea(PX, PZ, 6);
buildWall(PZ - 4, 3);
report('three block wall', walk(60));

// --- 4. ledge then walk off the top ------------------------------------
clearArea(PX, PZ, 8);
buildWall(PZ - 4, 1);
report('ledge walked at full speed', walk(150), 150);

process.exit(0);
