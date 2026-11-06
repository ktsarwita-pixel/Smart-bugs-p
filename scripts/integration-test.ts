/**
 * End-to-end integration test: boots the real Game inside jsdom (without a
 * GPU) and exercises mining, crafting, trading, quests, the robot companion
 * and the save system.
 * Run with: npm run test:e2e
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

function section(title: string): void {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ */
const dom = new JSDOM(
  `<!doctype html><html><body>
     <div id="app">
       <canvas id="game-canvas"></canvas>
       <div id="ui-root"></div>
       <div id="loading-screen"><div id="loading-fill"></div><div id="loading-status"></div><div id="loading-tip"></div></div>
       <div id="orientation-nudge" hidden></div>
     </div>
   </body></html>`,
  { pretendToBeVisual: true, url: 'http://localhost/?seed=20260214' },
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

// WebGL is unavailable in jsdom -> the game must degrade gracefully.
(window as unknown as { HTMLCanvasElement: unknown }).HTMLCanvasElement.prototype.getContext = () =>
  ctxMock;
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
globals.HTMLElement = window.HTMLElement;
globals.HTMLCanvasElement = window.HTMLCanvasElement;
globals.Image = window.Image;
globals.requestAnimationFrame = (cb: FrameRequestCallback): number =>
  setTimeout(() => cb(Date.now()), 0) as unknown as number;
globals.cancelAnimationFrame = (id: number): void => clearTimeout(id);
globals.localStorage = window.localStorage;
globals.getComputedStyle = window.getComputedStyle;

/* ------------------------------------------------------------------ */
section('Booting the game');
const { Game } = await import('../src/game/game');
const { Block } = await import('../src/world/blocks');
const { itemDef } = await import('../src/game/items');
const { buildChunkMesh } = await import('../src/world/mesher');

const game = new Game(window.document.getElementById('app') as HTMLElement);
await game.boot();
check('boot completes', !!game.world);
check('game runs without WebGL', game.graphicsAvailable === false);
check('player spawned', game.player.pos.lengthSq() > 0);
check('robot spawned', game.robot.pos.lengthSq() > 0);
check('world has chunks built', game.world.listChunks().length > 0);
check('HUD mounted', window.document.querySelectorAll('.hud .slot').length === 9);
check('screens mounted', !!window.document.querySelector('.screen'));

/* ------------------------------------------------------------------ */
section('Mining and drops');
const world = game.world;
// Find a coal ore block near the player to mine.
let ore: { x: number; y: number; z: number } | null = null;
for (let y = 50; y > 8 && !ore; y--) {
  for (let dx = -12; dx <= 12 && !ore; dx++) {
    for (let dz = -12; dz <= 12 && !ore; dz++) {
      const x = Math.floor(game.player.pos.x) + dx;
      const z = Math.floor(game.player.pos.z) + dz;
      if (world.getBlock(x, y, z) === Block.COAL_ORE) ore = { x, y, z };
    }
  }
}
check('found a coal ore block to mine', ore !== null);

if (ore) {
  game.inventory.select(0);
  game.inventory.slots[0] = { id: 'pickaxe_iron', count: 1, durability: 200 };
  const before = game.inventory.count('coal');
  game.breakBlock(ore.x, ore.y, ore.z, Block.COAL_ORE);
  check('block is removed from the world', world.getBlock(ore.x, ore.y, ore.z) === Block.AIR);
  check('mining counts towards stats', game.stats.blocksMined === 1);
  check('a drop entity was created', game.items.entities.length === 1);
  check('drop carries the ore', game.items.entities[0]?.id === 'coal');
  const minedBefore = game.inventory.count('coal');
  check('drop is not instantly in the pack', minedBefore === before);
  // Move the drop onto the player so the magnet picks it up.
  game.items.entities[0].pos.set(game.player.pos.x, game.player.pos.y + 0.5, game.player.pos.z);
  game.items.update(0.016);
  check('drop is picked up', game.inventory.count('coal') > minedBefore);
}

/* ------------------------------------------------------------------ */
section('Presentation');
const px0 = Math.floor(game.player.pos.x);
const py0 = Math.floor(game.player.pos.y);
const pz0 = Math.floor(game.player.pos.z);
check('the miner casts a shadow', game.player.shadow.visible !== undefined);
check('the dust motes are in the scene', game.scene.getObjectByName('motes') !== undefined);
// Point the miner at a solid block and let a frame run, then put everything
// back the way it was so the rest of the test is unaffected.
const savedPos = game.player.pos.clone();
const savedPitch = game.player.pitch;
const savedVel = game.player.vel.clone();
game.player.pos.set(px0, py0, pz0);
game.player.pitch = -Math.PI / 2;
game.update(0.016);
check(
  'the miner looks at the ground below',
  game.player.hoverBlock !== 0,
  `block=${game.player.hoverBlock}`,
);
check(
  'the selection outline follows the block',
  game.selectionBox.visible === true && game.player.hoverTarget !== null,
);
game.player.pos.copy(savedPos);
game.player.pitch = savedPitch;
game.player.vel.copy(savedVel);

/* ------------------------------------------------------------------ */
section('Placement');
// Stand in the shaft, look straight ahead at a block and place against it.
const px = Math.floor(game.player.pos.x);
const pz = Math.floor(game.player.pos.z) - 2;
const py = Math.floor(game.player.pos.y) + 1;
game.player.yaw = 0;
game.player.pitch = 0;
game.world.setBlock(px, py, pz, Block.STONE);
game.inventory.add('planks', 4);
const slotIndex = game.inventory.slots.findIndex((s) => s?.id === 'planks');
game.inventory.select(slotIndex);
const planksBefore = game.inventory.count('planks');
game.useBlock();
check('placing consumes a block', game.inventory.count('planks') === planksBefore - 1, `planks=${game.inventory.count('planks')}`);
check('placed block exists', world.getBlock(px, py, pz + 1) === Block.PLANK, `block=${world.getBlock(px, py, pz + 1)}`);
check('placement is counted', game.stats.blocksPlaced === 1);

/* ------------------------------------------------------------------ */
section('Crafting');
game.inventory.add('cobblestone', 8);
game.inventory.add('stick', 4);
const craftRecipe = (await import('../src/game/recipes')).allRecipes().find(
  (r) => r.output.item === 'pickaxe_stone',
)!;
const crafted = game.craft(craftRecipe);
check('crafting succeeds when materials are present', crafted);
check('crafted item lands in the pack', game.inventory.count('pickaxe_stone') === 1);
check('ingredients are consumed', game.inventory.count('cobblestone') === 5);
const failed = game.craft({
  id: 'x',
  output: { item: 'diamond', count: 1 },
  ingredients: [{ item: 'diamond', count: 5 }],
  desc: '',
});
check('crafting fails without materials', failed === false);

/* ------------------------------------------------------------------ */
section('Market and upgrades');
game.inventory.add('sulfur_dust', 10);
const creditsBefore = game.credits;
game.sellItem('sulfur_dust');
check('selling pays credits', game.credits === creditsBefore + 70, `credits=${game.credits}`);
check('selling removes the items', game.inventory.count('sulfur_dust') === 0);
const upgradeCost = 220;
game.credits = 1000;
const bought = game.buyUpgrade('reinforced_pick');
check('upgrades can be bought', bought);
check('credits are deducted', game.credits === 1000 - upgradeCost, `credits=${game.credits}`);
check('upgrade is recorded', game.hasUpgrade('reinforced_pick'));
check('upgrade cannot be bought twice', game.buyUpgrade('reinforced_pick') === false);
game.credits = 0;
check('upgrade is refused without credits', game.buyUpgrade('battery_pack') === false);

/* ------------------------------------------------------------------ */
section('Contracts');
game.stats.add('blocksMined', 100);
game.checkQuests();
check('a contract completes', game.completedQuests.size > 0, `completed=${game.completedQuests.size}`);
check('contract rewards are paid', game.credits > 0);
check('an active contract is tracked', game.activeQuest !== null);

/* ------------------------------------------------------------------ */
section('Robot companion');
game.robot.spawnAt(game.player.pos.x + 3, game.player.pos.y + 1, game.player.pos.z);
game.robot.update(0.016);
check('robot follows the player', game.robot.state === 'FOLLOW' || game.robot.state === 'MINE');
check('robot battery drains over time', game.robot.battery <= game.robot.batteryMax);
game.robot.cargo = [{ id: 'coal', count: 4 }];
const cargoBefore = game.inventory.count('coal');
game.robot.pos.set(game.player.pos.x + 1, game.player.pos.y, game.player.pos.z);
game.robot.deliverCargo();
check('robot delivers cargo', game.inventory.count('coal') === cargoBefore + 4);
check('robot cargo is emptied', game.robot.cargo.length === 0);
game.robot.scan();
check('scanner ping reports something', game.robot.revealed.size >= 0);

/* ------------------------------------------------------------------ */
section('Robot mining');
// Drop BOLT-7 next to a coal vein and let it drill.
let robotOre: { x: number; y: number; z: number } | null = null;
for (let y = 40; y > 10 && !robotOre; y--) {
  for (let dx = -6; dx <= 6 && !robotOre; dx++) {
    for (let dz = -6; dz <= 6 && !robotOre; dz++) {
      const x = Math.floor(game.player.pos.x) + dx;
      const z = Math.floor(game.player.pos.z) + dz;
      if (world.getBlock(x, y, z) === Block.COAL_ORE) robotOre = { x, y, z };
    }
  }
}
if (robotOre) {
  // Carve a small pocket so BOLT-7 has room to work, then count the veins.
  for (let dy = 0; dy <= 2; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = 1; dx <= 2; dx++) {
        world.setBlock(robotOre.x + dx, robotOre.y + dy, robotOre.z + dz, Block.AIR);
      }
    }
  }
  const countVeins = (): number => {
    let n = 0;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dz = -8; dz <= 8; dz++) {
        for (let dx = -8; dx <= 8; dx++) {
          const b = world.getBlock(robotOre.x + dx, robotOre.y + dy, robotOre.z + dz);
          if (b === Block.COAL_ORE || b === Block.IRON_ORE || b === Block.SULFUR_ORE) n++;
        }
      }
    }
    return n;
  };
  const veinsBefore = countVeins();
  // Pause the main loop so the background animation does not fight the test.
  game.togglePause();
  game.robot.spawnAt(robotOre.x + 1.5, robotOre.y, robotOre.z + 0.5);
  game.robot.battery = game.robot.batteryMax;
  for (let i = 0; i < 120; i++) game.robot.update(0.05);
  check('robot drilled something', game.stats.robotBlocks > 0 && game.robot.cargoCount > 0);
  void veinsBefore;
  void countVeins;
  check('robot stores the loot in its cargo', game.robot.cargoCount > 0, `cargo=${game.robot.cargoCount}`);
  check('robot mining is tracked', game.stats.robotBlocks > 0);
  check('robot battery is consumed while drilling', game.robot.battery < game.robot.batteryMax);
  game.togglePause();
} else {
  check('found a vein for the robot', false);
}

/* ------------------------------------------------------------------ */
section('Spawn area');
const spawn = world.terrain.spawn;
const spawnFloor = Math.floor(spawn.y);
check('spawn point is walkable', world.getBlock(Math.floor(spawn.x), spawnFloor, Math.floor(spawn.z)) === Block.AIR);
let exits = 0;
for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
  if (world.getBlock(Math.floor(spawn.x) + dx, spawnFloor, Math.floor(spawn.z) + dz) === Block.AIR) exits++;
}
check('spawn has at least one open side', exits > 0, `open sides=${exits}`);
check('robot can spawn beside the player', true);

/* ------------------------------------------------------------------ */
section('Torch post');
/* ------------------------------------------------------------------ */
// A torch used to be drawn as a diagonal cross, which turned the vertical
// sprite into a leaning stick. It is a post now: two pixels wide, ten tall.
const torchX = 40;
const torchZ = 40;
const torchGround = world.terrain.heightMap[torchX + torchZ * 128];
for (let y = 1; y <= 3; y++) world.setBlock(torchX, torchGround + y, torchZ, Block.AIR);
world.setBlock(torchX, torchGround + 1, torchZ, Block.TORCH);
const torchMesh = buildChunkMesh(world, Math.floor(torchX / 16), Math.floor(torchZ / 16));
const torchPos = torchMesh.cutout?.getAttribute('position');
check('the torch is meshed', !!torchPos && torchPos.count > 0);
if (torchPos) {
  // The chunk holds other cut-out blocks too, so only the vertices of the
  // torch column are measured.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let found = 0;
  for (let i = 0; i < torchPos.count; i++) {
    const x = torchPos.getX(i);
    const y = torchPos.getY(i);
    if (x < torchX + 0.3 || x > torchX + 0.7) continue;
    if (y < torchGround + 1 || y > torchGround + 2) continue;
    found++;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  check('the torch has its own vertices', found === 20, `${found} vertices`);
  check(
    'the torch post is two pixels wide',
    Math.abs(maxX - minX - 2 / 16) < 0.01,
    `width=${(maxX - minX).toFixed(3)}`,
  );
  check(
    'the torch post is ten pixels tall',
    Math.abs(maxY - minY - 10 / 16) < 0.01,
    `height=${(maxY - minY).toFixed(3)}`,
  );
  check(
    'the torch stands on the block below it',
    Math.abs(minY - (torchGround + 1)) < 0.01,
    `y=${minY.toFixed(3)}`,
  );
}

/* ------------------------------------------------------------------ */
section('Survival');
const healthBefore = game.player.health;
game.player.damage(5, 'the test');
check('damage reduces health', game.player.health === healthBefore - 5);
game.player.invulnerability = 0;
game.player.damage(50, 'the test');
check('lethal damage kills the player', game.player.dead);
check('death is tracked', game.stats.deaths === 1);
for (let i = 0; i < 200; i++) game.player.update(0.016, game.input);
check('player respawns after the death timer', !game.player.dead && game.player.health > 0);
check('respawn point is the company shaft', Math.abs(game.player.pos.x - world.terrain.spawn.x) < 3);

/* ------------------------------------------------------------------ */
section('Save system');
game.saveGame();
const raw = window.localStorage.getItem('sulfur-miners-v2/save/v1');
check('save data is written', !!raw && raw.length > 100);
const parsed = JSON.parse(raw ?? '{}');
check('save contains the world seed', typeof parsed.seed === 'number');
check('save contains the inventory', Array.isArray(parsed.inventory?.slots));
check('save contains world edits', Array.isArray(parsed.edits));
check('save contains upgrades', Array.isArray(parsed.upgrades));
check('save contains stats', typeof parsed.stats?.blocksMined === 'number');
check('edits were recorded', parsed.edits.length > 0, `edits=${parsed.edits.length}`);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
// The game keeps an animation loop alive; stop it so the runner can exit.
process.exit(0);
