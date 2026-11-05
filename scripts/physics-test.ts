/**
 * Physics regression tests: landing, stepping, void safety and the spawn.
 * Run with: npm run test:physics
 */
import { JSDOM } from 'jsdom';

let failures = 0;
let checks = 0;
function check(name: string, condition: boolean, extra = ''): void {
  checks++;
  if (condition) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

const dom = new JSDOM(
  `<!doctype html><html><body>
     <div id="app"><canvas id="game-canvas"></canvas><div id="ui-root"></div>
     <div id="loading-screen"><div id="loading-fill"></div><div id="loading-status"></div><div id="loading-tip"></div></div>
     <div id="orientation-nudge" hidden></div></div>
   </body></html>`,
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
(window as unknown as { HTMLCanvasElement: unknown }).HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,iVBORw0KGgo=';
const g = globalThis as unknown as Record<string, unknown>;
g.window = window; g.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
for (const k of ['HTMLCanvasElement','Image','ImageData','HTMLElement','HTMLDivElement','SVGElement','HTMLInputElement','Event','CustomEvent','Blob','URL','Node','Element']) g[k] = (window as unknown as Record<string, unknown>)[k];
g.localStorage = window.localStorage;
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
g.devicePixelRatio = 1;

const { Game } = await import('../src/game/game');
const { collides, moveEntity } = await import('../src/entities/physics');
const { PLAYER } = await import('../src/core/constants');
const { Block } = await import('../src/world/blocks');

const game = new Game(window.document.getElementById('app') as HTMLElement);
await game.boot();
const world = game.world;
const player = game.player;

/* ------------------------------------------------------------------ */
console.log('\nSpawn safety');
/* ------------------------------------------------------------------ */
const spawn = world.terrain.spawn;
check(
  'the spawn point stands on solid ground',
  world.isSolidAt(Math.floor(spawn.x), Math.floor(spawn.y) - 1, Math.floor(spawn.z)),
  `spawn=(${spawn.x}, ${spawn.y}, ${spawn.z})`,
);
check(
  'the spawn point is not inside a block',
  !world.isSolidAt(Math.floor(spawn.x), Math.floor(spawn.y), Math.floor(spawn.z)),
);
check(
  'the spawn column is not a bottomless shaft',
  world.isSolidAt(Math.floor(spawn.x), Math.floor(spawn.y) - 2, Math.floor(spawn.z)),
  'two blocks below the spawn must be solid',
);

/* ------------------------------------------------------------------ */
console.log('\nLanding');
/* ------------------------------------------------------------------ */
// Drop the player onto the ground and let them settle.
const px = 40.5;
const pz = 40.5;
const groundY = world.terrain.heightMap[Math.floor(px) + Math.floor(pz) * 128];
player.pos.set(px, groundY + 6, pz);
player.vel.set(0, 0, 0);
player.fallDistance = 0;
player.dead = false;
player.health = player.maxHealth;

for (let i = 0; i < 400; i++) {
  player.vel.y -= PLAYER.gravity * 0.016;
  if (player.vel.y < -PLAYER.terminalVelocity) player.vel.y = -PLAYER.terminalVelocity;
  const res = moveEntity(world, player.pos, player.vel, PLAYER.width / 2, PLAYER.height, 0.016, PLAYER.stepHeight);
  if (res.grounded) break;
}
const resting = player.pos.y;
check(
  'a landed player is not embedded in the floor',
  !collides(world, player.pos.x, player.pos.y, player.pos.z, PLAYER.width / 2, PLAYER.height),
  `y=${resting.toFixed(3)}`,
);
check(
  'a landed player rests on top of the block',
  Math.abs(resting - (groundY + 1)) < 0.15,
  `expected ${groundY + 1}, got ${resting.toFixed(3)}`,
);

// Can the player walk after landing?
const before = player.pos.x;
player.vel.x = PLAYER.walkSpeed;
moveEntity(world, player.pos, player.vel, PLAYER.width / 2, PLAYER.height, 0.016, PLAYER.stepHeight);
check(
  'a landed player can walk',
  player.pos.x > before + 0.01,
  `x ${before.toFixed(3)} -> ${player.pos.x.toFixed(3)}`,
);

/* ------------------------------------------------------------------ */
console.log('\nWalking into a wall');
/* ------------------------------------------------------------------ */
// Walking into a wall must not throw the miner back: the old snap-back used
// the position from before the blocked move, which sent them a whole block
// backwards every time they touched a wall.
const wallX = 40;
const wallZ = 38;
for (let y = 1; y <= 2; y++) {
  for (let z = wallZ - 2; z <= wallZ; z++) {
    world.setBlock(wallX, groundY + y, z, Block.STONE);
  }
}
player.pos.set(wallX + 0.5, groundY + 1, 40.5);
player.vel.set(0, 0, 0);
player.yaw = 0;
player.pitch = 0;
player.dead = false;
player.health = player.maxHealth;

const state = game.input.state as unknown as { moveForward: number };
let reversals = 0;
let lastZ = player.pos.z;
let lastDir = 0;
for (let i = 0; i < 90; i++) {
  state.moveForward = 1;
  player.update(0.016, game.input);
  const dir = Math.sign(player.pos.z - lastZ);
  if (dir !== 0) {
    if (lastDir !== 0 && dir !== lastDir) reversals++;
    lastDir = dir;
  }
  lastZ = player.pos.z;
}
check(
  'walking into a wall does not throw the miner back',
  reversals === 0,
  `the miner reversed direction ${reversals} times`,
);
// The wall occupies z = 38..39, so the miner rests at 39 + half a body.
const restingZ = wallZ + 1 + PLAYER.width / 2;
check(
  'the miner stops against the wall',
  Math.abs(player.pos.z - restingZ) < 0.05,
  `z=${player.pos.z.toFixed(3)}, expected ${restingZ.toFixed(3)}`,
);

// A one block ledge must be climbed with a glide, not with a jump: the miner
// used to be teleported a whole block up, which read as an automatic jump.
for (let y = 1; y <= 2; y++) {
  for (let z = wallZ - 2; z <= wallZ; z++) {
    world.setBlock(wallX, groundY + y, z, Block.AIR);
  }
}
world.setBlock(wallX, groundY + 1, wallZ - 2, Block.STONE);
player.pos.set(wallX + 0.5, groundY + 1, 40.5);
player.vel.set(0, 0, 0);
player.yaw = 0;
player.dead = false;
player.fallDistance = 0;

let biggestRise = 0;
let highestY = -Infinity;
let climbReversals = 0;
let prevY = player.pos.y;
let prevZ = player.pos.z;
let prevDir = 0;
for (let i = 0; i < 150; i++) {
  state.moveForward = 1;
  player.update(0.016, game.input);
  const rise = player.pos.y - prevY;
  if (rise > biggestRise) biggestRise = rise;
  if (player.pos.y > highestY) highestY = player.pos.y;
  const dir = Math.sign(player.pos.z - prevZ);
  if (dir !== 0) {
    if (prevDir !== 0 && dir !== prevDir) climbReversals++;
    prevDir = dir;
  }
  prevY = player.pos.y;
  prevZ = player.pos.z;
}
check(
  'the miner climbs a one block ledge',
  highestY > groundY + 1.5,
  `the miner reached y=${highestY.toFixed(2)}, the ledge top is ${groundY + 2}`,
);
check(
  'climbing a ledge is a glide, not a jump',
  biggestRise < 0.25,
  `the miner rose ${biggestRise.toFixed(3)} blocks in a single frame`,
);
check(
  'the miner keeps walking over the ledge',
  player.pos.z < wallZ - 2.5,
  `z=${player.pos.z.toFixed(2)}`,
);
check(
  'gliding up a ledge does not push the miner back',
  climbReversals === 0,
  `the miner reversed direction ${climbReversals} times`,
);

// A two block wall is too tall to walk over: the miner has to jump it.
world.setBlock(wallX, groundY + 1, wallZ - 2, Block.AIR);
world.setBlock(wallX, groundY + 1, wallZ - 1, Block.STONE);
world.setBlock(wallX, groundY + 2, wallZ - 1, Block.STONE);
player.pos.set(wallX + 0.5, groundY + 1, 40.5);
player.vel.set(0, 0, 0);
player.yaw = 0;
player.dead = false;
player.fallDistance = 0;
let wallReversals = 0;
let wallDir = 0;
let wallZ0 = player.pos.z;
for (let i = 0; i < 120; i++) {
  state.moveForward = 1;
  player.update(0.016, game.input);
  const dir = Math.sign(player.pos.z - wallZ0);
  if (dir !== 0) {
    if (wallDir !== 0 && dir !== wallDir) wallReversals++;
    wallDir = dir;
  }
  wallZ0 = player.pos.z;
}
check(
  'a two block wall stops the miner',
  player.pos.y < groundY + 1.5,
  `y=${player.pos.y.toFixed(2)}`,
);
check(
  'a two block wall does not shove the miner back and forth',
  wallReversals === 0,
  `the miner reversed direction ${wallReversals} times`,
);

/* ------------------------------------------------------------------ */
console.log('\nVoid safety');
/* ------------------------------------------------------------------ */
check(
  'the world has a floor below the bedrock',
  world.isSolidAt(4, 0, 4) || world.isSolidAt(4, -1, 4),
  'y=0 and y=-1 must be solid so nothing falls out of the world',
);

// Fall out of the world: the game has to pull the miner back.
player.pos.set(4.5, -30, 4.5);
player.vel.set(0, -20, 0);
player.dead = false;
player.update(0.016, game.input);
check(
  'a miner who falls out of the world is recovered',
  player.pos.y > 0 && !player.dead,
  `y=${player.pos.y.toFixed(2)} dead=${player.dead}`,
);

// Walking off the edge of the map must not strand the miner either.
player.pos.set(-5, spawn.y + 1, spawn.z);
player.vel.set(0, 0, 0);
player.dead = false;
player.update(0.016, game.input);
check(
  'a miner who walks off the map is recovered',
  player.pos.x > 0 && player.pos.x < 128 && player.pos.z > 0 && player.pos.z < 128,
  `pos=(${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)})`,
);

/* ------------------------------------------------------------------ */
console.log('\nFall damage');
/* ------------------------------------------------------------------ */
player.health = player.maxHealth;
player.dead = false;
player.pos.set(px, groundY + 20, pz);
player.vel.set(0, 0, 0);
player.fallDistance = 0;
for (let i = 0; i < 600; i++) {
  player.update(0.016, game.input);
  if (player.pos.y <= groundY + 1.2) break;
}
check(
  'a twenty block fall hurts but does not instantly kill',
  player.health < player.maxHealth && player.health > 0,
  `hp=${player.health.toFixed(1)}`,
);
check(
  'a twenty block fall is survivable',
  player.health >= player.maxHealth - 20,
  `hp=${player.health.toFixed(1)}`,
);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
}
process.exit(failures === 0 ? 0 : 1);
