/**
 * Debug harness: boots the real game headlessly and plays it — walking,
 * looking, mining and placing — while reporting runtime diagnostics.
 *
 * The harness is what the mcp-debugger session launches, so breakpoints can be
 * set in the game source and inspected while the game is running.
 *
 * Run with: npm run debug:harness
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
globals.HTMLInputElement = window.HTMLInputElement;
globals.HTMLImageElement = window.HTMLImageElement;
globals.HTMLButtonElement = window.HTMLButtonElement;
globals.HTMLAnchorElement = window.HTMLAnchorElement;
globals.HTMLSpanElement = window.HTMLSpanElement;
globals.HTMLImageElement = window.HTMLImageElement;
globals.Node = window.Node;
globals.Element = window.Element;
globals.Event = window.Event;
globals.CustomEvent = window.CustomEvent;
globals.localStorage = window.localStorage;
globals.Blob = window.Blob;
globals.URL = window.URL;
globals.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globals.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globals.devicePixelRatio = 1;

const { Game } = await import('../src/game/game');
const { Block } = await import('../src/world/blocks');

const game = new Game(window.document.getElementById('app') as HTMLElement);
await game.boot();

// Expose the live game for debugger expression evaluation.
(globalThis as unknown as Record<string, unknown>).__game = game;

/* ------------------------------------------------------------------ */
/* Input simulation                                                    */
/* ------------------------------------------------------------------ */
const key = (type: string, code: string): void => {
  window.dispatchEvent(new window.KeyboardEvent(type, { code, key: code, bubbles: true }));
};
const mouse = (type: string, button: number): void => {
  const target = window.document.getElementById('game-canvas') as HTMLCanvasElement;
  target.dispatchEvent(
    new window.MouseEvent(type, { button, bubbles: true, clientX: 400, clientY: 300 }),
  );
};

let frame = 0;
let lastReport = performance.now();
const start = performance.now();
const timings: number[] = [];

function report(): void {
  const g = game as unknown as {
    player: { pos: { x: number; y: number; z: number }; health: number; stamina: number; gas: number };
    robot: { pos: { x: number; y: number; z: number }; state: string; battery: number; cargoCount: number };
    world: { listChunks: () => Array<{ cx: number; cz: number; dirty: boolean; meshes: unknown[] }> };
    mobs: { mobs: unknown[] };
    items: { entities: unknown[] };
    credits: number;
    stats: { get: (k: string) => number };
  };
  const chunks = g.world.listChunks();
  const dirty = chunks.filter((c) => c.dirty).length;
  const meshes = chunks.reduce((n, c) => n + c.meshes.length, 0);
  const now = performance.now();
  const fps = (frame * 1000) / (now - start);
  timings.push(now - lastReport);
  lastReport = now;
  const heap = (process.memoryUsage().heapUsed / 1048576).toFixed(1);
  console.log(
    `[t+${((now - start) / 1000).toFixed(1)}s] frame=${frame} fps=${fps.toFixed(1)} ` +
      `player=(${g.player.pos.x.toFixed(1)},${g.player.pos.y.toFixed(1)},${g.player.pos.z.toFixed(1)}) ` +
      `hp=${g.player.health.toFixed(0)} gas=${g.player.gas.toFixed(0)} ` +
      `robot=${g.robot.state}@(${g.robot.pos.x.toFixed(1)},${g.robot.pos.y.toFixed(1)},${g.robot.pos.z.toFixed(1)}) ` +
      `target=${JSON.stringify((g.robot as unknown as { mineTarget: unknown }).mineTarget)} ` +
      `batt=${g.robot.battery.toFixed(0)} cargo=${g.robot.cargoCount} ` +
      `chunks=${chunks.length} dirty=${dirty} meshes=${meshes} ` +
      `mobs=${g.mobs.mobs.length} items=${g.items.entities.length} ` +
      `credits=${g.credits} mined=${g.stats.get('blocksMined')} heap=${heap}MB`,
  );
}

// Walk forward, look around, mine and place for a while.
key('keydown', 'KeyW');
mouse('mousedown', 0);

// jsdom's rAF clock does not share a time origin with performance.now(), so
// the very first game frame sees a negative delta and launches the player
// into the sky. Normalise the clock so the harness behaves like a browser.
const gAny = game as unknown as { loop: (now: number) => void; lastFrame: number };
const originalLoop = gAny.loop.bind(game);
gAny.loop = (now: number): void => {
  gAny.lastFrame = now - 16;
  originalLoop(now);
};

const tick = (): void => {
  frame++;
  // Swing the view and the pick every few seconds.
  if (frame % 40 === 0) {
    mouse('mouseup', 0);
    mouse('mousedown', 0);
    window.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, movementX: 12, movementY: 3 }));
  }
  if (frame % 200 === 0) {
    key('keyup', 'KeyW');
    key('keydown', 'KeyS');
  }
  if (frame % 400 === 0) {
    key('keyup', 'KeyS');
    key('keydown', 'KeyW');
  }
  if (frame % 100 === 0) {
    try {
      report();
    } catch (error) {
      console.log('report failed:', (error as Error).message);
    }
  }
  if (frame < 900) window.requestAnimationFrame(tick);
  else {
    console.log('harness finished');
    process.exit(0);
  }
};
window.requestAnimationFrame(tick);

// Keep the block registry reachable for expression evaluation in the debugger.
(globalThis as unknown as Record<string, unknown>).__Block = Block;
