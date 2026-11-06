/**
 * Headless UI tests: build the HUD, screens and touch controls inside jsdom
 * and make sure every panel renders without throwing.
 * Run with: npm run test:ui
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
/* DOM environment                                                     */
/* ------------------------------------------------------------------ */
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
const { window } = dom;

// Minimal 2D canvas mock — enough for the pixel-art texture generator.
const ctxMock: Record<string, unknown> = {};
const ctxMethods = [
  'fillRect',
  'clearRect',
  'strokeRect',
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'arc',
  'fill',
  'stroke',
  'save',
  'restore',
  'translate',
  'rotate',
  'scale',
  'transform',
  'setTransform',
  'drawImage',
  'createImageData',
  'putImageData',
  'getImageData',
  'clip',
  'rect',
  'quadraticCurveTo',
  'bezierCurveTo',
  'setLineDash',
  'fillText',
  'strokeText',
  'measureText',
];
for (const name of ctxMethods) {
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
  /* keep the host navigator */
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
/* Stubs                                                               */
/* ------------------------------------------------------------------ */
const { Inventory } = await import('../src/game/inventory');
const { Stats } = await import('../src/game/quests');
const { itemDef } = await import('../src/game/items');

const inventory = new Inventory(36);
inventory.add('stone', 64);
inventory.add('pickaxe_iron', 1);
inventory.add('sulfur_dust', 12);
inventory.slots[0]!.durability = 120;

const player = {
  pos: { x: 64, y: 30, z: 64 },
  health: 17,
  maxHealth: 20,
  stamina: 80,
  gas: 12,
  yaw: 0.6,
  mineProgress: 0.4,
  viewMode: 'first' as const,
  lanternOn: false,
  hoverBlock: 0,
};

const robot = {
  state: 'FOLLOW' as const,
  battery: 72,
  batteryMax: 100,
  cargoCount: 3,
  cargoLimit: 8,
  revealed: new Map<string, { x: number; y: number; z: number }>(),
};

const settings = {
  sensitivity: 1,
  fov: 78,
  volume: 0.6,
  renderDistance: 6,
  invertY: false,
  touchControls: true,
  showFps: true,
  ambience: true,
};

const audio = {
  ui: () => undefined,
  beep: () => undefined,
  dig: () => undefined,
  hurt: () => undefined,
  hit: () => undefined,
  pickup: () => undefined,
  step: () => undefined,
  breakBlock: () => undefined,
};

const baseGame = {
  inventory,
  player,
  robot,
  stats: new Stats(),
  credits: 420,
  settings,
  audio,
  nearSmelter: true,
  activeQuest: {
    id: 'first_shift',
    name: 'First Shift',
    desc: 'Break 15 blocks of any kind.',
    goal: 15,
    stat: 'blocksMined' as const,
    reward: 60,
  },
  surfaceHeight: 34,
  world: { terrain: { biomeMap: new Uint8Array(128 * 128) } },
  clockString: () => '07:30',
  hasUpgrade: (id: string) => id === 'battery_pack',
  currentTool: () => null,
  craft: () => true,
  buyUpgrade: () => true,
  sellItem: () => undefined,
  applyGear: () => undefined,
  applySettings: () => undefined,
  saveGame: () => undefined,
  resetWorld: () => undefined,
  sortInventory: () => undefined,
  dropJunk: () => undefined,
  onScreenOpened: () => undefined,
  onScreenClosed: () => undefined,
  notify: () => undefined,
  togglePause: () => undefined,
  toggleViewMode: () => undefined,
};

const game = new Proxy(baseGame, {
  get(target, prop: string) {
    if (prop in target) return (target as unknown as Record<string, unknown>)[prop];
    return () => undefined;
  },
}) as never;

/* ------------------------------------------------------------------ */
/* Texture generation                                                  */
/* ------------------------------------------------------------------ */
section('Procedural textures');
const { buildAtlas, itemIcon } = await import('../src/render/textures');
const atlas = buildAtlas();
check('atlas canvas is created', !!atlas && atlas.width > 0, `w=${atlas?.width}`);
check('atlas has 16px tiles', atlas.width % 16 === 0 && atlas.height % 16 === 0);
const icon = itemIcon('stone');
check('block icons render', typeof icon === 'string' && icon.startsWith('data:image'));
check('tool icons render', itemIcon('pickaxe_iron').startsWith('data:image'));
check('material icons render', itemIcon('sulfur_dust').startsWith('data:image'));
check('unknown items fall back gracefully', itemIcon('not_a_real_item').startsWith('data:image'));

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */
section('HUD');
const { HUD } = await import('../src/ui/hud');
const hud = new HUD(game);
const uiRoot = window.document.getElementById('ui-root') ?? window.document.body;
uiRoot.appendChild(hud.root);
check('HUD builds', hud.root.querySelectorAll('.slot').length === 9, 'hotbar slots');
check('crosshair exists', !!hud.root.querySelector('.crosshair'));
check('compass exists', !!hud.root.querySelector('.compass-strip'));
let hudError: unknown = null;
try {
  for (let i = 0; i < 5; i++) hud.update(0.016, 60);
} catch (error) {
  hudError = error;
}
check('HUD updates without throwing', hudError === null, String(hudError));
const hotbarSlot = hud.root.querySelectorAll('.slot')[0];
check('hotbar renders item icons', !!hotbarSlot?.querySelector('img'));
hud.notify('Test toast', 'good');
check('toasts are appended', hud.root.querySelectorAll('.toast').length === 1);
check('hit marker exists', !!hud.root.querySelector('[data-hitmarker]'));
check('target name exists', !!hud.root.querySelector('[data-target]'));
check('biome chip exists', !!hud.root.querySelector('[data-biome]'));
hud.showHitMarker('mob');
check('hit marker flashes on a hit', hud.root.querySelector('[data-hitmarker]')?.classList.contains('show') === true);
check(
  'the biome is named',
  (hud.root.querySelector('[data-biome]')?.textContent ?? '').length > 0,
  hud.root.querySelector('[data-biome]')?.textContent ?? '',
);
player.hoverBlock = 3;
hud.update(0.016, 60);
check(
  'the block under the crosshair is named',
  (hud.root.querySelector('[data-target]')?.textContent ?? '').length > 0,
  hud.root.querySelector('[data-target]')?.textContent ?? '',
);

/* ------------------------------------------------------------------ */
/* Screens                                                             */
/* ------------------------------------------------------------------ */
section('Screens');
const { Screens } = await import('../src/ui/screens');
const screens = new Screens(game);
uiRoot.appendChild(screens.root);
let screenError: unknown = null;
const tabs = ['inventory', 'crafting', 'upgrades', 'market', 'stats', 'settings', 'help'];
for (const tab of tabs) {
  try {
    screens.open(tab as never);
    screens.render();
  } catch (error) {
    screenError = error;
    console.error(`    tab ${tab} failed: ${String(error)}`);
    break;
  }
}
check('every screen renders', screenError === null, String(screenError));
check('screens container is populated', screens.root.querySelectorAll('.panel').length === 1);
const recipesShown = (() => {
  screens.open('crafting');
  return screens.root.querySelectorAll('.recipe').length;
})();
check('crafting screen lists recipes', recipesShown > 10, `recipes=${recipesShown}`);
const upgradeCards = (() => {
  screens.open('upgrades');
  return screens.root.querySelectorAll('.upgrade').length;
})();
check('upgrades screen lists upgrades', upgradeCards > 5, `upgrades=${upgradeCards}`);

/* ------------------------------------------------------------------ */
/* Touch controls                                                      */
/* ------------------------------------------------------------------ */
section('Touch controls');
const { TouchControls } = await import('../src/ui/touch');
const inputStub = {
  setTouchMove: () => undefined,
  addTouchLook: () => undefined,
  setTouchMine: () => undefined,
  setTouchPlace: () => undefined,
  setTouchJump: () => undefined,
  setTouchSprint: () => undefined,
};
const touch = new TouchControls(game, inputStub as never);
uiRoot.appendChild(touch.root);
check('joystick exists', !!touch.root.querySelector('.joystick'));
check('action buttons exist', touch.root.querySelectorAll('.touch-btn').length >= 6);
let touchError: unknown = null;
try {
  touch.setEnabled(true);
  touch.setEnabled(false);
} catch (error) {
  touchError = error;
}
check('touch controls toggle without throwing', touchError === null, String(touchError));

/* ------------------------------------------------------------------ */
section('Mobile look and touch routing');
/* ------------------------------------------------------------------ */
// The overlays cover the whole screen. If they swallow touches the miner can
// never drag to look around on a phone.
const css = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
function pointerEventsFor(selector: string): string {
  // Find every rule that mentions the selector and keep the most specific one.
  let best = '';
  let bestScore = -1;
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = ruleRe.exec(css))) {
    const selectors = match[1].split(',').map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    const body = match[2];
    const pe = /pointer-events:\s*(none|auto)/.exec(body);
    if (!pe) continue;
    const score =
      (selector.includes('#') ? 100 : 0) +
      (selector.includes('>') ? 10 : 0) +
      (selector.includes('.') ? 5 : 0);
    if (score >= bestScore) {
      bestScore = score;
      best = pe[1];
    }
  }
  return best;
}
check(
  'the HUD does not swallow touches meant for the canvas',
  pointerEventsFor('#ui-root > .hud') === 'none',
  `got "${pointerEventsFor('#ui-root > .hud')}"`,
);
check(
  'the touch layer does not swallow touches meant for the canvas',
  pointerEventsFor('#ui-root > .touch-layer') === 'none',
  `got "${pointerEventsFor('#ui-root > .touch-layer')}"`,
);
check(
  'the hotbar slots stay tappable',
  pointerEventsFor('#ui-root > .hud .hotbar .slot') === 'auto',
  `got "${pointerEventsFor('#ui-root > .hud .hotbar .slot')}"`,
);

// The look gesture has to work from anywhere except the touch controls.
const lookCalls: Array<{ x: number; y: number }> = [];
const lookInput = {
  ...inputStub,
  addTouchLook: (dx: number, dy: number) => lookCalls.push({ x: dx, y: dy }),
};
const gameForLook = { togglePause: () => undefined, toggleViewMode: () => undefined };
const { Game: GameClass } = await import('../src/game/game');
const canvasEl = document.createElement('canvas');
canvasEl.id = 'game-canvas';
document.body.appendChild(canvasEl);
const gameInstance = new GameClass(document.body);
gameInstance.settings.touchControls = true;
(gameInstance as unknown as { screens: { isOpen: boolean } }).screens = { isOpen: false };
// The look gesture is wired up from the game loop; bind it directly here.
(gameInstance as unknown as { handleTouchLook(): void }).handleTouchLook();
// Watch the game's own input: that is what the look gesture talks to.
const realInput = gameInstance.input;
realInput.addTouchLook = (dx: number, dy: number) => lookCalls.push({ x: dx, y: dy });
const touchForLook = new TouchControls(gameForLook as never, lookInput as never);
uiRoot.appendChild(touchForLook.root);
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
check('the game has a canvas to drag', !!canvas);

function pointerEvent(type: string, x: number, y: number, target: EventTarget): Event {
  const ev = new window.Event(type, { bubbles: true, cancelable: true }) as Event & {
    pointerId: number;
    pointerType: string;
    clientX: number;
    clientY: number;
  };
  ev.pointerId = 7;
  ev.pointerType = 'touch';
  ev.clientX = x;
  ev.clientY = y;
  Object.defineProperty(ev, 'target', { value: target, configurable: true });
  return ev;
}

// A swipe on the canvas looks around.
canvas.dispatchEvent(pointerEvent('pointerdown', 300, 400, canvas));
canvas.dispatchEvent(pointerEvent('pointermove', 360, 430, canvas));
check(
  'dragging on the canvas looks around',
  lookCalls.length > 0 && lookCalls[0]!.x > 0,
  `calls=${JSON.stringify(lookCalls)}`,
);

// A drag that starts on a touch control belongs to that control.
lookCalls.length = 0;
const joystick = touchForLook.root.querySelector('.joystick') as HTMLElement;
joystick.dispatchEvent(pointerEvent('pointerdown', 60, 700, joystick));
joystick.dispatchEvent(pointerEvent('pointermove', 90, 700, joystick));
check(
  'dragging the joystick does not spin the camera',
  lookCalls.length === 0,
  `calls=${JSON.stringify(lookCalls)}`,
);

/* ------------------------------------------------------------------ */
section('Item metadata');
check('tools expose tool stats', !!itemDef('pickaxe_iron').tool);
check('placeable items expose a block', itemDef('stone').place !== undefined);
check('gear items are flagged', itemDef('gas_mask').gear === 'mask');

/* ------------------------------------------------------------------ */
section('Sprites');
const { hasItemIcon } = await import('../src/render/textures');
const { allItemIds } = await import('../src/game/items');
const missing = allItemIds().filter((id) => !hasItemIcon(id));
check(
  'every item has a sprite of its own',
  missing.length === 0,
  `without an icon: ${missing.join(', ')}`,
);
// The tools have to look different from each other.
const toolIds = allItemIds().filter((id) => !!itemDef(id).tool);
check(
  'the game ships tools to draw',
  toolIds.length >= 6,
  `${toolIds.length} tools`,
);

check(
  'the torch is drawn as a post, not a cross',
  (await import('../src/world/blocks')).blockDef(19).render === 'torch',
);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
