/** Frame-by-frame trace of the player's position right after spawn. */
import { JSDOM } from 'jsdom';

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
const game = new Game(window.document.getElementById('app') as HTMLElement);
await game.boot();
const p = game.player;

console.log('spawn:', p.pos.x.toFixed(2), p.pos.y.toFixed(2), p.pos.z.toFixed(2), 'respawn:', p.respawnPoint.toArray().map((v) => v.toFixed(1)).join(','));

// Wrap the private loop to capture the real dt the game uses.
(globalThis as unknown as Record<string, unknown>).__TRACE = true;
const gAny = game as unknown as { loop: (now: number) => void; lastFrame: number };
const originalLoop = gAny.loop.bind(game);
let captured = 0;
let prevNow = 0;
gAny.loop = (now: number): void => {
  originalLoop(now);
  captured++;
  if (captured <= 45) {
    const p2 = game.player;
    console.log(
      `G f=${captured} dt=${((now - prevNow) / 1000).toFixed(4)} lastFrame=${gAny.lastFrame.toFixed(1)} ` +
        `pos=(${p2.pos.x.toFixed(2)}, ${p2.pos.y.toFixed(2)}, ${p2.pos.z.toFixed(2)}) ` +
        `vel=(${p2.vel.x.toFixed(2)}, ${p2.vel.y.toFixed(2)}, ${p2.vel.z.toFixed(2)}) ` +
        `ground=${p2.onGround} fall=${p2.fallDistance.toFixed(1)} hp=${p2.health.toFixed(0)} dead=${p2.dead}`,
    );
  }
  prevNow = now;
};

let frame = 0;
const tick = (): void => {
  frame++;
  if (false) {
    console.log(
      `f=${frame} pos=(${p.pos.x.toFixed(2)}, ${p.pos.y.toFixed(2)}, ${p.pos.z.toFixed(2)}) ` +
        `vel=(${p.vel.x.toFixed(2)}, ${p.vel.y.toFixed(2)}, ${p.vel.z.toFixed(2)}) onGround=${p.onGround} ` +
        `fall=${p.fallDistance.toFixed(1)} hp=${p.health.toFixed(0)} dead=${p.dead}`,
    );
  }
  if (frame < 200) window.requestAnimationFrame(tick);
  else process.exit(0);
};
window.requestAnimationFrame(tick);
