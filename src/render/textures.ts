import * as THREE from 'three';
import { ATLAS_COLS, TILE_NAMES, TILE_PX, type TileName } from '../world/tiles';
import { blockDef, ITEM_TO_BLOCK } from '../world/blocks';
import { RNG } from '../core/rng';

type Ctx = CanvasRenderingContext2D;

/** Per-tile painter. Coordinates are 0..15 in tile space. */
type Painter = (p: Painter2D) => void;

class Painter2D {
  constructor(
    readonly ctx: Ctx,
    readonly ox: number,
    readonly oy: number,
    readonly rng: RNG,
  ) {}

  set(x: number, y: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.ox + x, this.oy + y, 1, 1);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.ox + x, this.oy + y, w, h);
  }

  clear(x: number, y: number, w: number, h: number): void {
    this.ctx.clearRect(this.ox + x, this.oy + y, w, h);
  }

  /** Random speckle inside a rect. */
  speckle(x: number, y: number, w: number, h: number, colors: string[], chance = 0.35): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (this.rng.chance(chance)) this.set(xx, yy, this.rng.pick(colors));
      }
    }
  }

  /** Random blob (used for ore pockets). */
  blob(cx: number, cy: number, radius: number, color: string, outline?: string): void {
    for (let y = cy - radius - 1; y <= cy + radius + 1; y++) {
      for (let x = cx - radius - 1; x <= cx + radius + 1; x++) {
        if (x < 0 || y < 0 || x > 15 || y > 15) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= radius - 0.4) this.set(x, y, color);
        else if (outline && d <= radius + 0.6) this.set(x, y, outline);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    for (let i = 0; i < 64; i++) {
      this.set(x, y, color);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }
}

const P = (fn: Painter): Painter => fn;

/* ------------------------------------------------------------------ */
/* Tile painters                                                       */
/* ------------------------------------------------------------------ */

const painters: Partial<Record<TileName, Painter>> = {
  stone: P((p) => {
    p.rect(0, 0, 16, 16, '#7d7d7d');
    p.speckle(0, 0, 16, 16, ['#8d8d8d', '#6f6f6f', '#757575', '#838383'], 0.4);
    p.rect(2, 3, 5, 4, '#717171');
    p.rect(9, 9, 4, 3, '#6b6b6b');
    p.rect(6, 12, 3, 2, '#898989');
  }),
  dirt: P((p) => {
    p.rect(0, 0, 16, 16, '#8b5a2b');
    p.speckle(0, 0, 16, 16, ['#7a4d24', '#9c6a37', '#84552a'], 0.45);
    p.rect(4, 5, 2, 2, '#6b421e');
    p.rect(11, 9, 2, 2, '#a4763f');
    p.rect(7, 13, 3, 1, '#6b421e');
  }),
  grass_top: P((p) => {
    p.rect(0, 0, 16, 16, '#4f9b3a');
    p.speckle(0, 0, 16, 16, ['#5aa942', '#468c33', '#62b04a'], 0.5);
    p.rect(3, 4, 2, 2, '#6cbb52');
    p.rect(10, 8, 3, 2, '#3d7a2c');
    p.rect(6, 12, 2, 2, '#69b350');
  }),
  grass_side: P((p) => {
    p.rect(0, 0, 16, 16, '#8b5a2b');
    p.speckle(0, 6, 16, 10, ['#7a4d24', '#9c6a37'], 0.4);
    p.rect(0, 0, 16, 5, '#4f9b3a');
    p.speckle(0, 0, 16, 5, ['#5aa942', '#468c33'], 0.5);
    for (let x = 0; x < 16; x++) {
      if (p.rng.chance(0.45)) p.rect(x, 5, 1, 1 + (p.rng.chance(0.4) ? 1 : 0), '#4f9b3a');
    }
  }),
  sand: P((p) => {
    p.rect(0, 0, 16, 16, '#ddd3a0');
    p.speckle(0, 0, 16, 16, ['#d3c894', '#e7deae', '#cabd8a'], 0.4);
    p.rect(5, 7, 2, 1, '#c3b382');
    p.rect(11, 3, 2, 1, '#efe7bd');
  }),
  gravel: P((p) => {
    p.rect(0, 0, 16, 16, '#8c8a85');
    for (let i = 0; i < 26; i++) {
      const x = p.rng.int(0, 15);
      const y = p.rng.int(0, 15);
      const c = p.rng.pick(['#a3a09a', '#75736f', '#b6b2aa', '#63615e']);
      p.rect(x, y, p.rng.int(1, 3), p.rng.int(1, 3), c);
    }
  }),
  cobblestone: P((p) => {
    p.rect(0, 0, 16, 16, '#5f5f5f');
    const stones: Array<[number, number, number, number]> = [
      [1, 1, 6, 5],
      [8, 1, 6, 4],
      [1, 7, 4, 4],
      [6, 6, 8, 4],
      [1, 12, 6, 3],
      [8, 11, 6, 4],
    ];
    for (const [x, y, w, h] of stones) {
      p.rect(x, y, w, h, '#8b8b8b');
      p.rect(x, y, w, 1, '#9d9d9d');
      p.rect(x, y + h - 1, w, 1, '#717171');
      p.rect(x, y, 1, h, '#969696');
      p.rect(x + w - 1, y, 1, h, '#707070');
    }
  }),
  coal_ore: P((p) => {
    p.rect(0, 0, 16, 16, '#7d7d7d');
    p.speckle(0, 0, 16, 16, ['#8d8d8d', '#6f6f6f'], 0.4);
    p.blob(5, 5, 2.1, '#1c1c1c', '#2d2d2d');
    p.blob(11, 9, 1.8, '#1c1c1c', '#2d2d2d');
    p.blob(8, 13, 1.2, '#232323');
  }),
  iron_ore: P((p) => {
    p.rect(0, 0, 16, 16, '#7d7d7d');
    p.speckle(0, 0, 16, 16, ['#8d8d8d', '#6f6f6f'], 0.4);
    p.blob(4, 6, 2.0, '#d7a883', '#b07f5e');
    p.blob(10, 4, 1.5, '#d7a883', '#b07f5e');
    p.blob(11, 11, 2.0, '#c99a78', '#a9785a');
    p.set(5, 6, '#f0cbb0');
    p.set(11, 11, '#e5b89a');
  }),
  gold_ore: P((p) => {
    p.rect(0, 0, 16, 16, '#7d7d7d');
    p.speckle(0, 0, 16, 16, ['#8d8d8d', '#6f6f6f'], 0.4);
    p.blob(5, 5, 2.2, '#f0c33c', '#b98d16');
    p.blob(11, 10, 2.0, '#f0c33c', '#b98d16');
    p.set(4, 4, '#ffe680');
    p.set(10, 9, '#ffe680');
  }),
  diamond_ore: P((p) => {
    p.rect(0, 0, 16, 16, '#7d7d7d');
    p.speckle(0, 0, 16, 16, ['#8d8d8d', '#6f6f6f'], 0.4);
    p.blob(5, 6, 2.1, '#4fe0dc', '#2aa8a6');
    p.blob(11, 10, 1.7, '#4fe0dc', '#2aa8a6');
    p.set(4, 5, '#c9fffd');
    p.set(10, 9, '#c9fffd');
  }),
  sulfur_ore: P((p) => {
    p.rect(0, 0, 16, 16, '#7d7d7d');
    p.speckle(0, 0, 16, 16, ['#8d8d8d', '#6f6f6f'], 0.4);
    p.blob(5, 5, 2.3, '#e8d24a', '#a89420');
    p.blob(11, 10, 2.1, '#e8d24a', '#a89420');
    p.blob(8, 13, 1.1, '#f3e06a');
    p.set(4, 4, '#fbf3a8');
  }),
  sulfur_crystal: P((p) => {
    p.rect(0, 0, 16, 16, '#3b3524');
    p.speckle(0, 0, 16, 16, ['#443d29', '#332e20'], 0.5);
    p.blob(8, 8, 3.2, '#d9c437', '#8f7f1a');
    p.blob(8, 8, 1.6, '#f4e878', '#d9c437');
    p.set(7, 6, '#fffbd0');
    p.rect(2, 12, 2, 3, '#c9b52f');
    p.rect(12, 2, 2, 3, '#c9b52f');
  }),
  lava: P((p) => {
    p.rect(0, 0, 16, 16, '#d2441a');
    p.speckle(0, 0, 16, 16, ['#e85a22', '#b83a14', '#f07a28'], 0.55);
    p.blob(5, 6, 2.2, '#ffb43c', '#e07a1e');
    p.blob(11, 10, 1.8, '#ffd76a', '#e07a1e');
    p.set(4, 5, '#fff0b0');
  }),
  water: P((p) => {
    p.rect(0, 0, 16, 16, 'rgba(40,104,198,0.82)');
    p.speckle(0, 0, 16, 16, ['rgba(54,128,224,0.82)', 'rgba(30,84,170,0.82)'], 0.35);
    p.rect(2, 5, 6, 1, 'rgba(150,205,255,0.75)');
    p.rect(9, 11, 5, 1, 'rgba(150,205,255,0.7)');
  }),
  bedrock: P((p) => {
    p.rect(0, 0, 16, 16, '#3b3b3b');
    for (let i = 0; i < 22; i++) {
      const x = p.rng.int(0, 15);
      const y = p.rng.int(0, 15);
      const c = p.rng.pick(['#575757', '#2a2a2a', '#454545', '#1e1e1e']);
      p.rect(x, y, p.rng.int(1, 4), p.rng.int(1, 3), c);
    }
  }),
  log_side: P((p) => {
    p.rect(0, 0, 16, 16, '#5a3f22');
    for (let x = 0; x < 16; x += 2) {
      p.rect(x, 0, 1, 16, '#4a3319');
      if (p.rng.chance(0.6)) p.rect(x + 1, p.rng.int(0, 13), 1, 3, '#6a4b28');
    }
    p.rect(0, 0, 16, 1, '#6b4a29');
  }),
  log_top: P((p) => {
    p.rect(0, 0, 16, 16, '#9c7440');
    for (let r = 7; r > 0; r -= 2) {
      p.rect(8 - r, 8 - r, r * 2, r * 2, r % 4 === 1 ? '#8a6435' : '#a87d46');
    }
    p.rect(7, 7, 2, 2, '#6b4a29');
  }),
  leaves: P((p) => {
    p.clear(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (p.rng.chance(0.12)) continue;
        const c = p.rng.pick(['#3f7a2c', '#4c8f34', '#356828', '#579c3c']);
        p.set(x, y, c);
      }
    }
  }),
  planks: P((p) => {
    p.rect(0, 0, 16, 16, '#a97b45');
    for (let y = 0; y < 16; y += 4) {
      p.rect(0, y, 16, 3, '#b3854c');
      p.rect(0, y + 3, 16, 1, '#7d5a32');
      for (let i = 0; i < 4; i++) p.set(p.rng.int(0, 15), y + p.rng.int(0, 2), '#9a6f3e');
    }
    p.rect(6, 0, 1, 4, '#8a6338');
    p.rect(11, 8, 1, 4, '#8a6338');
  }),
  torch: P((p) => {
    p.clear(0, 0, 16, 16);
    p.rect(7, 6, 2, 10, '#6b4a29');
    p.rect(7, 6, 1, 10, '#825733');
    p.blob(8, 4, 1.6, '#ffd24a', '#e07a1e');
    p.set(8, 2, '#fff3b8');
    p.set(7, 3, '#ffe680');
  }),
  glass: P((p) => {
    p.clear(0, 0, 16, 16);
    p.rect(0, 0, 16, 1, 'rgba(220,240,255,0.85)');
    p.rect(0, 15, 16, 1, 'rgba(220,240,255,0.85)');
    p.rect(0, 0, 1, 16, 'rgba(220,240,255,0.85)');
    p.rect(15, 0, 1, 16, 'rgba(220,240,255,0.85)');
    p.rect(3, 3, 2, 1, 'rgba(255,255,255,0.55)');
    p.rect(11, 7, 2, 1, 'rgba(255,255,255,0.4)');
    p.rect(7, 11, 1, 3, 'rgba(255,255,255,0.3)');
  }),
  brick: P((p) => {
    p.rect(0, 0, 16, 16, '#9c5b43');
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      p.rect(0, y, 16, 1, '#c9b8a6');
      const offset = row % 2 === 0 ? 0 : 4;
      for (let i = 0; i < 2; i++) {
        const x = (offset + i * 8) % 16;
        p.rect(x, y, 1, 4, '#c9b8a6');
      }
      for (let i = 0; i < 8; i++) p.set(p.rng.int(0, 15), y + p.rng.int(1, 3), '#8a4f3a');
    }
  }),
  steel_block: P((p) => {
    p.rect(0, 0, 16, 16, '#9aa3ab');
    p.speckle(0, 0, 16, 16, ['#aab3bb', '#8b949c'], 0.35);
    p.rect(0, 0, 16, 2, '#c3ccd4');
    p.rect(0, 14, 16, 2, '#6e767d');
    for (const [x, y] of [[2, 2], [12, 2], [2, 12], [12, 12]] as const) {
      p.rect(x, y, 2, 2, '#d7dee4');
      p.set(x, y, '#f0f4f8');
    }
  }),
  sulfur_brick: P((p) => {
    p.rect(0, 0, 16, 16, '#c9b437');
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      p.rect(0, y, 16, 1, '#efe6b8');
      const offset = row % 2 === 0 ? 0 : 4;
      for (let i = 0; i < 2; i++) {
        const x = (offset + i * 8) % 16;
        p.rect(x, y, 1, 4, '#efe6b8');
      }
    }
    p.speckle(0, 0, 16, 16, ['#d8c452', '#b8a32c'], 0.18);
  }),
  charger: P((p) => {
    p.rect(0, 0, 16, 16, '#3c4650');
    p.speckle(0, 0, 16, 16, ['#48535e', '#333c45'], 0.3);
    p.rect(1, 1, 14, 14, '#2b333b');
    p.rect(2, 2, 12, 12, '#3f4a55');
    p.rect(3, 3, 3, 3, '#7fd1a8');
    p.rect(9, 3, 3, 3, '#7fd1a8');
    p.rect(3, 9, 3, 3, '#57a87e');
    p.rect(9, 9, 3, 3, '#3d7a5c');
    p.rect(6, 7, 4, 2, '#dfe8ef');
    p.rect(7, 5, 2, 6, '#dfe8ef');
  }),
  smelter: P((p) => {
    p.rect(0, 0, 16, 16, '#4a4239');
    p.speckle(0, 0, 16, 16, ['#554c42', '#3e382f'], 0.35);
    p.rect(2, 5, 12, 8, '#2a241f');
    p.rect(3, 6, 10, 6, '#e0641d');
    p.rect(4, 7, 8, 4, '#ffb03a');
    p.rect(5, 8, 6, 2, '#ffe9a8');
    p.rect(1, 1, 14, 2, '#6a5f52');
    p.rect(6, 2, 4, 2, '#8b7f6e');
  }),
  beacon: P((p) => {
    p.rect(0, 0, 16, 16, '#2f3a44');
    p.speckle(0, 0, 16, 16, ['#3a4752', '#26303a'], 0.3);
    p.rect(2, 2, 12, 12, '#1d2730');
    p.blob(8, 8, 3.0, '#57e0d6', '#2a9c96');
    p.blob(8, 8, 1.4, '#d6fffb', '#57e0d6');
    for (const [x, y] of [[0, 0], [14, 0], [0, 14], [14, 14]] as const) p.rect(x, y, 2, 2, '#6f7d88');
  }),
  lamp: P((p) => {
    p.rect(0, 0, 16, 16, '#6b5320');
    p.rect(1, 1, 14, 14, '#f2c14e');
    p.rect(3, 3, 10, 10, '#ffd97a');
    p.rect(5, 5, 6, 6, '#fff3c4');
    for (let i = 0; i < 4; i++) {
      p.rect(i * 4, 0, 1, 16, '#8a6a2a');
      p.rect(0, i * 4, 16, 1, '#8a6a2a');
    }
  }),
  ash: P((p) => {
    p.rect(0, 0, 16, 16, '#5d5a57');
    p.speckle(0, 0, 16, 16, ['#67635f', '#514e4b', '#6f6b66'], 0.55);
  }),
  deepslate: P((p) => {
    p.rect(0, 0, 16, 16, '#3c4149');
    p.speckle(0, 0, 16, 16, ['#454b55', '#333840'], 0.45);
    p.rect(3, 4, 5, 4, '#353a42');
    p.rect(9, 10, 4, 3, '#4a505a');
  }),
  sulfur_sand: P((p) => {
    p.rect(0, 0, 16, 16, '#ded089');
    p.speckle(0, 0, 16, 16, ['#d4c478', '#e9dda0', '#c9b95f'], 0.45);
    p.rect(6, 6, 3, 2, '#c2ac45');
  }),
  fungus: P((p) => {
    p.clear(0, 0, 16, 16);
    p.rect(7, 8, 2, 7, '#c8bda0');
    p.blob(8, 6, 3.0, '#e8d24a', '#a89420');
    p.blob(8, 5, 1.6, '#f6ec9a', '#e8d24a');
    p.set(4, 9, '#e8d24a');
    p.set(12, 10, '#e8d24a');
  }),
  crystal_shard: P((p) => {
    p.clear(0, 0, 16, 16);
    p.rect(7, 2, 2, 13, '#d9c437');
    p.rect(6, 5, 1, 9, '#a89420');
    p.rect(9, 4, 1, 8, '#f0e26a');
    p.rect(4, 9, 2, 5, '#c9b52f');
    p.rect(10, 8, 2, 6, '#c9b52f');
    p.set(7, 2, '#fffbd0');
  }),
  mossy_stone: P((p) => {
    p.rect(0, 0, 16, 16, '#7d7d7d');
    p.speckle(0, 0, 16, 16, ['#8d8d8d', '#6f6f6f'], 0.4);
    for (let i = 0; i < 16; i++) {
      const x = p.rng.int(0, 15);
      const y = p.rng.int(0, 15);
      p.blob(x, y, p.rng.float(1.2, 2.4), '#4d7c38', '#3c6a2b');
    }
  }),
  iron_block: P((p) => {
    p.rect(0, 0, 16, 16, '#d8d8dc');
    p.speckle(0, 0, 16, 16, ['#e6e6ea', '#c6c6cc'], 0.3);
    p.rect(0, 0, 16, 1, '#f4f4f8');
    p.rect(0, 15, 16, 1, '#a8a8b0');
  }),
  gold_block: P((p) => {
    p.rect(0, 0, 16, 16, '#f0c33c');
    p.speckle(0, 0, 16, 16, ['#f8d768', '#dbae2a'], 0.3);
    p.rect(0, 0, 16, 1, '#ffe89a');
    p.rect(0, 15, 16, 1, '#b48c14');
  }),
  sulfur_block: P((p) => {
    p.rect(0, 0, 16, 16, '#e8d24a');
    p.speckle(0, 0, 16, 16, ['#f2df74', '#d3bd3c'], 0.35);
    p.rect(0, 0, 16, 1, '#fbf3a8');
    p.rect(0, 15, 16, 1, '#a89420');
  }),
};

for (let i = 0; i < 10; i++) {
  const stage = i;
  painters[`crack_${stage}` as TileName] = P((p) => {
    p.clear(0, 0, 16, 16);
    const strokes = stage + 1;
    for (let s = 0; s < strokes; s++) {
      let x = p.rng.int(3, 12);
      let y = p.rng.int(3, 12);
      const len = 2 + stage;
      for (let i = 0; i < len; i++) {
        p.set(x, y, 'rgba(10,8,6,0.85)');
        x += p.rng.int(-1, 1);
        y += p.rng.int(0, 1);
        if (x < 0 || y < 0 || x > 15 || y > 15) break;
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Atlas generation                                                   */
/* ------------------------------------------------------------------ */

let atlasCanvas: HTMLCanvasElement | null = null;

export function buildAtlas(): HTMLCanvasElement {
  if (atlasCanvas) return atlasCanvas;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE_PX;
  canvas.height = Math.ceil(TILE_NAMES.length / ATLAS_COLS) * TILE_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  TILE_NAMES.forEach((name, index) => {
    const ox = (index % ATLAS_COLS) * TILE_PX;
    const oy = Math.floor(index / ATLAS_COLS) * TILE_PX;
    const painter = painters[name];
    if (painter) painter(new Painter2D(ctx, ox, oy, new RNG(0x9e37 + index * 7919)));
  });

  atlasCanvas = canvas;
  return canvas;
}

export function createAtlasTexture(): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(buildAtlas());
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** UV rectangle for a tile index inside the atlas. */
export function tileUV(index: number): [number, number, number, number] {
  const cols = ATLAS_COLS;
  const x = index % cols;
  const y = Math.floor(index / cols);
  const rows = Math.ceil(TILE_NAMES.length / cols);
  // Flip V because canvas origin is top-left.
  const u0 = x / cols;
  const v0 = 1 - (y + 1) / rows;
  const du = 1 / cols;
  const dv = 1 / rows;
  return [u0, v0, du, dv];
}

/* ------------------------------------------------------------------ */
/* Item icons                                                          */
/* ------------------------------------------------------------------ */

type IconPainter = (ctx: Ctx) => void;

const ICON_SIZE = 32;

function iconCanvas(): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** Draw an isometric cube for a block item. */
function cubeIcon(ctx: Ctx, top: number, side: number, bottom: number): void {
  const atlas = buildAtlas();
  const cols = ATLAS_COLS;
  const src = (tile: number) => {
    const x = (tile % cols) * TILE_PX;
    const y = Math.floor(tile / cols) * TILE_PX;
    return { x, y };
  };

  const faces: Array<{ tile: number; m: [number, number, number, number, number, number]; shade: number }> = [
    // left face
    {
      tile: side,
      m: [13 / 16, 7 / 16, 0, 14 / 16, 3, 10],
      shade: 0.55,
    },
    // right face
    {
      tile: side,
      m: [13 / 16, -7 / 16, 0, 14 / 16, 16, 17],
      shade: 0.78,
    },
    // top face
    {
      tile: top,
      m: [13 / 16, 7 / 16, -13 / 16, 7 / 16, 16, 3],
      shade: 1,
    },
  ];

  for (const face of faces) {
    const s = src(face.tile);
    ctx.save();
    ctx.transform(face.m[0], face.m[1], face.m[2], face.m[3], face.m[4], face.m[5]);
    ctx.drawImage(atlas, s.x, s.y, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
    ctx.restore();
    if (face.shade < 1) {
      ctx.save();
      ctx.transform(face.m[0], face.m[1], face.m[2], face.m[3], face.m[4], face.m[5]);
      ctx.fillStyle = `rgba(0,0,0,${(1 - face.shade).toFixed(2)})`;
      ctx.fillRect(0, 0, TILE_PX, TILE_PX);
      ctx.restore();
    }
  }
  // outline
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(3, 10);
  ctx.lineTo(16, 3);
  ctx.lineTo(29, 10);
  ctx.lineTo(29, 24);
  ctx.lineTo(16, 31);
  ctx.lineTo(3, 24);
  ctx.closePath();
  ctx.stroke();
  void bottom;
}

const toolIcons: Record<string, IconPainter> = {
  pickaxe: (ctx) => {
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(14, 10, 4, 20);
    ctx.fillStyle = '#6b421e';
    ctx.fillRect(14, 18, 4, 8);
    ctx.fillStyle = '#d8d8dc';
    ctx.beginPath();
    ctx.moveTo(4, 8);
    ctx.lineTo(28, 12);
    ctx.lineTo(27, 16);
    ctx.lineTo(5, 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4f4f8';
    ctx.fillRect(6, 9, 18, 2);
  },
  axe: (ctx) => {
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(15, 8, 4, 22);
    ctx.fillStyle = '#d8d8dc';
    ctx.beginPath();
    ctx.moveTo(18, 4);
    ctx.lineTo(28, 10);
    ctx.lineTo(28, 20);
    ctx.lineTo(18, 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4f4f8';
    ctx.fillRect(19, 6, 6, 3);
  },
  shovel: (ctx) => {
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(14, 12, 4, 18);
    ctx.fillStyle = '#d8d8dc';
    ctx.beginPath();
    ctx.moveTo(9, 4);
    ctx.lineTo(23, 4);
    ctx.lineTo(20, 13);
    ctx.lineTo(12, 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4f4f8';
    ctx.fillRect(10, 5, 12, 2);
  },
  sword: (ctx) => {
    ctx.fillStyle = '#d8d8dc';
    ctx.beginPath();
    ctx.moveTo(6, 26);
    ctx.lineTo(22, 4);
    ctx.lineTo(27, 6);
    ctx.lineTo(11, 28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4f4f8';
    ctx.beginPath();
    ctx.moveTo(9, 24);
    ctx.lineTo(23, 6);
    ctx.lineTo(25, 7);
    ctx.lineTo(11, 25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(4, 24, 10, 4);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(2, 28, 7, 3);
  },
  coal: (ctx) => {
    ctx.fillStyle = '#151515';
    ctx.beginPath();
    ctx.moveTo(8, 12);
    ctx.lineTo(18, 8);
    ctx.lineTo(25, 15);
    ctx.lineTo(21, 24);
    ctx.lineTo(10, 24);
    ctx.lineTo(5, 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(11, 13, 5, 4);
    ctx.fillRect(17, 18, 3, 3);
  },
  raw_iron: (ctx) => {
    ctx.fillStyle = '#c99a78';
    ctx.beginPath();
    ctx.moveTo(6, 20);
    ctx.lineTo(12, 10);
    ctx.lineTo(24, 12);
    ctx.lineTo(27, 21);
    ctx.lineTo(16, 25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e5b89a';
    ctx.fillRect(12, 12, 7, 4);
    ctx.fillStyle = '#a9785a';
    ctx.fillRect(9, 19, 6, 3);
  },
  iron_ingot: (ctx) => {
    ctx.fillStyle = '#d8d8dc';
    ctx.beginPath();
    ctx.moveTo(5, 19);
    ctx.lineTo(9, 12);
    ctx.lineTo(24, 12);
    ctx.lineTo(28, 19);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4f4f8';
    ctx.fillRect(9, 12, 15, 3);
    ctx.fillStyle = '#a8a8b0';
    ctx.fillRect(8, 18, 17, 2);
  },
  raw_gold: (ctx) => {
    ctx.fillStyle = '#d8b64a';
    ctx.beginPath();
    ctx.moveTo(6, 20);
    ctx.lineTo(12, 10);
    ctx.lineTo(24, 12);
    ctx.lineTo(27, 21);
    ctx.lineTo(16, 25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffe680';
    ctx.fillRect(12, 12, 7, 4);
  },
  gold_ingot: (ctx) => {
    ctx.fillStyle = '#f0c33c';
    ctx.beginPath();
    ctx.moveTo(5, 19);
    ctx.lineTo(9, 12);
    ctx.lineTo(24, 12);
    ctx.lineTo(28, 19);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffe89a';
    ctx.fillRect(9, 12, 15, 3);
    ctx.fillStyle = '#b48c14';
    ctx.fillRect(8, 18, 17, 2);
  },
  diamond: (ctx) => {
    ctx.fillStyle = '#4fe0dc';
    ctx.beginPath();
    ctx.moveTo(16, 5);
    ctx.lineTo(26, 13);
    ctx.lineTo(16, 27);
    ctx.lineTo(6, 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c9fffd';
    ctx.beginPath();
    ctx.moveTo(16, 5);
    ctx.lineTo(21, 13);
    ctx.lineTo(16, 16);
    ctx.lineTo(11, 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2aa8a6';
    ctx.fillRect(13, 16, 6, 8);
  },
  sulfur_dust: (ctx) => {
    ctx.fillStyle = '#e8d24a';
    ctx.beginPath();
    ctx.moveTo(5, 24);
    ctx.lineTo(10, 15);
    ctx.lineTo(20, 13);
    ctx.lineTo(27, 22);
    ctx.lineTo(16, 27);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f6ec9a';
    ctx.fillRect(12, 16, 6, 4);
    ctx.fillStyle = '#a89420';
    ctx.fillRect(8, 23, 6, 2);
  },
  sulfur_crystal: (ctx) => {
    ctx.fillStyle = '#d9c437';
    ctx.beginPath();
    ctx.moveTo(16, 3);
    ctx.lineTo(25, 15);
    ctx.lineTo(16, 28);
    ctx.lineTo(7, 15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4e878';
    ctx.beginPath();
    ctx.moveTo(16, 3);
    ctx.lineTo(21, 14);
    ctx.lineTo(16, 19);
    ctx.lineTo(11, 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fffbd0';
    ctx.fillRect(15, 5, 2, 6);
  },
  battery: (ctx) => {
    ctx.fillStyle = '#3c4650';
    ctx.fillRect(8, 6, 16, 22);
    ctx.fillStyle = '#57e07a';
    ctx.fillRect(10, 9, 12, 16);
    ctx.fillStyle = '#a8ffb8';
    ctx.fillRect(10, 9, 12, 5);
    ctx.fillStyle = '#d8d8dc';
    ctx.fillRect(13, 3, 6, 3);
  },
  gas_mask: (ctx) => {
    ctx.fillStyle = '#3b444d';
    ctx.beginPath();
    ctx.moveTo(6, 8);
    ctx.lineTo(26, 8);
    ctx.lineTo(24, 22);
    ctx.lineTo(8, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#57e0d6';
    ctx.beginPath();
    ctx.arc(12, 15, 4, 0, Math.PI * 2);
    ctx.arc(21, 15, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e262d';
    ctx.fillRect(10, 22, 13, 5);
    ctx.fillStyle = '#7fd1a8';
    ctx.fillRect(12, 24, 3, 2);
  },
  scanner: (ctx) => {
    ctx.fillStyle = '#39424b';
    ctx.fillRect(7, 12, 18, 14);
    ctx.fillStyle = '#57e0d6';
    ctx.fillRect(10, 15, 12, 7);
    ctx.fillStyle = '#d6fffb';
    ctx.fillRect(11, 16, 4, 3);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(20, 16, 2, 3);
    ctx.fillStyle = '#2a323a';
    ctx.fillRect(14, 4, 4, 9);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(12, 2, 8, 3);
  },
  lantern: (ctx) => {
    ctx.fillStyle = '#6b5320';
    ctx.fillRect(9, 4, 14, 24);
    ctx.fillStyle = '#ffd97a';
    ctx.fillRect(11, 7, 10, 18);
    ctx.fillStyle = '#fff3c4';
    ctx.fillRect(13, 11, 6, 10);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(13, 2, 6, 3);
  },
  backpack: (ctx) => {
    ctx.fillStyle = '#6b4a2c';
    ctx.fillRect(7, 8, 18, 20);
    ctx.fillStyle = '#8a6338';
    ctx.fillRect(7, 8, 18, 7);
    ctx.fillStyle = '#c9b28a';
    ctx.fillRect(9, 17, 14, 3);
    ctx.fillRect(9, 22, 14, 3);
  },
  thruster: (ctx) => {
    ctx.fillStyle = '#5a6570';
    ctx.fillRect(12, 4, 8, 14);
    ctx.fillStyle = '#39424b';
    ctx.fillRect(10, 16, 12, 6);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(13, 22, 6, 6);
    ctx.fillStyle = '#ff8b3a';
    ctx.fillRect(14, 24, 4, 5);
  },
  beef: (ctx) => {
    ctx.fillStyle = '#b04a3a';
    ctx.fillRect(8, 10, 16, 14);
    ctx.fillStyle = '#d2695a';
    ctx.fillRect(10, 12, 6, 5);
    ctx.fillStyle = '#f0d8b0';
    ctx.fillRect(8, 8, 16, 4);
  },
  bread: (ctx) => {
    ctx.fillStyle = '#c08a45';
    ctx.fillRect(7, 11, 18, 12);
    ctx.fillStyle = '#d9a45c';
    ctx.fillRect(9, 13, 14, 4);
  },
};

const iconCache = new Map<string, string>();

/** Returns a data URL for the icon of an item id. */
export function itemIcon(itemId: string): string {
  const cached = iconCache.get(itemId);
  if (cached) return cached;

  const { canvas, ctx } = iconCanvas();
  const blockId = BLOCK_ITEM_TO_BLOCK.get(itemId);
  if (blockId !== undefined) {
    const def = blockDef(blockId);
    cubeIcon(ctx, def.top, def.side, def.bottom);
  } else {
    const painter = toolIcons[itemId];
    if (painter) painter(ctx);
    else {
      // generic fallback: coloured gem
      ctx.fillStyle = '#c9a227';
      ctx.beginPath();
      ctx.moveTo(16, 5);
      ctx.lineTo(25, 13);
      ctx.lineTo(16, 27);
      ctx.lineTo(7, 13);
      ctx.closePath();
      ctx.fill();
    }
  }

  const url = canvas.toDataURL('image/png');
  iconCache.set(itemId, url);
  return url;
}

export const BLOCK_ITEM_TO_BLOCK = ITEM_TO_BLOCK;

const iconTextureCache = new Map<string, THREE.CanvasTexture>();

/** Cached THREE texture for an item icon (used by dropped item sprites). */
export function itemIconTexture(itemId: string): THREE.CanvasTexture {
  const cached = iconTextureCache.get(itemId);
  if (cached) return cached;
  const img = new Image();
  img.src = itemIcon(itemId);
  const tex = new THREE.CanvasTexture(img);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  iconTextureCache.set(itemId, tex);
  return tex;
}
