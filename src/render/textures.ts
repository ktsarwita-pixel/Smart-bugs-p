import * as THREE from 'three';
import { ATLAS_COLS, TILE_NAMES, TILE_PX, type TileName } from '../world/tiles';
import { blockDef, ITEM_TO_BLOCK } from '../world/blocks';
import { RNG } from '../core/rng';

type Ctx = CanvasRenderingContext2D;

/** Per-tile painter. Coordinates are 0..15 in tile space. */
type Painter = (p: Painter2D) => void;

/** Lightens or darkens a hex colour. */
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * factor)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

class Painter2D {
  constructor(
    readonly ctx: Ctx,
    readonly ox: number,
    readonly oy: number,
    readonly rng: RNG,
  ) {}

  set(x: number, y: number, color: string): void {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
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

  /** Irregular blob (used for ore pockets and moss). */
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

  /** A cluster with a lit top-left and a shadowed bottom-right. */
  lump(cx: number, cy: number, radius: number, color: string, light: string, dark: string): void {
    for (let y = cy - radius - 1; y <= cy + radius + 1; y++) {
      for (let x = cx - radius - 1; x <= cx + radius + 1; x++) {
        if (x < 0 || y < 0 || x > 15 || y > 15) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d > radius + 0.3) continue;
        if (x + y < cx + cy) this.set(x, y, light);
        else if (x + y > cx + cy + 1) this.set(x, y, dark);
        else this.set(x, y, color);
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

  /** A jagged crack, the way rock breaks. */
  crack(x0: number, y0: number, x1: number, y1: number, color: string): void {
    let x = x0;
    let y = y0;
    for (let i = 0; i < 24; i++) {
      this.set(x, y, color);
      if (x === x1 && y === y1) break;
      x += Math.sign(x1 - x) && this.rng.chance(0.7) ? Math.sign(x1 - x) : 0;
      y += this.rng.chance(0.75) ? Math.sign(y1 - y) : 0;
      if (x === x0 && y === y0) break;
    }
  }

  /** A soft vertical gradient. */
  gradient(x: number, y: number, w: number, h: number, top: string, bottom: string): void {
    for (let yy = 0; yy < h; yy++) {
      const t = h <= 1 ? 0 : yy / (h - 1);
      this.rect(x, y + yy, w, 1, t < 0.5 ? shade(top, 1 + (0.5 - t) * 0.3) : shade(bottom, 1 + (t - 0.5) * 0.3));
    }
  }
}

const P = (fn: Painter): Painter => fn;

/* ------------------------------------------------------------------ */
/* Shared tile pieces                                                 */
/* ------------------------------------------------------------------ */

/** Plain rock, used under every ore. */
function rockBase(p: Painter2D, base = '#7d7d7d'): void {
  p.rect(0, 0, 16, 16, base);
  for (let i = 0; i < 8; i++) {
    p.blob(p.rng.int(0, 15), p.rng.int(0, 15), p.rng.float(1.2, 2.6), shade(base, p.rng.float(0.9, 0.96)));
  }
  p.speckle(0, 0, 16, 16, [shade(base, 1.12), shade(base, 0.88), shade(base, 1.06)], 0.32);
}

/** An ore pocket: dark rim, body, lit top-left and a bright speck. */
function orePocket(
  p: Painter2D,
  cx: number,
  cy: number,
  r: number,
  body: string,
  light: string,
  rim: string,
): void {
  p.blob(cx, cy, r + 0.9, rim);
  p.blob(cx, cy, r, body);
  p.blob(cx - 0.6, cy - 0.6, r * 0.45, light);
  p.set(cx - 1, cy - 1, shade(light, 1.25));
}

/* ------------------------------------------------------------------ */
/* Tile painters                                                       */
/* ------------------------------------------------------------------ */

const painters: Partial<Record<TileName, Painter>> = {
  stone: P((p) => {
    const base = '#7d7d7d';
    rockBase(p, base);
    p.crack(2, 3, 6, 7, shade(base, 0.74));
    p.crack(9, 8, 13, 12, shade(base, 0.76));
    p.set(11, 3, shade(base, 1.28));
    p.set(3, 11, shade(base, 1.22));
    p.rect(6, 6, 2, 1, shade(base, 1.1));
  }),
  dirt: P((p) => {
    const base = '#8b5a2b';
    p.rect(0, 0, 16, 16, base);
    for (let i = 0; i < 7; i++) {
      p.lump(p.rng.int(1, 14), p.rng.int(1, 14), p.rng.float(1.0, 1.8), shade(base, 0.88), shade(base, 1.12), shade(base, 0.72));
    }
    p.speckle(0, 0, 16, 16, [shade(base, 1.14), shade(base, 0.82), '#6b421e'], 0.4);
    // Little roots.
    p.line(4, 1, 5, 4, '#6b421e');
    p.line(11, 9, 10, 12, '#6b421e');
    p.set(12, 3, '#a4763f');
  }),
  grass_top: P((p) => {
    const base = '#4f9b3a';
    p.rect(0, 0, 16, 16, base);
    for (let i = 0; i < 9; i++) {
      const x = p.rng.int(0, 15);
      const y = p.rng.int(0, 15);
      p.lump(x, y, p.rng.float(1.0, 1.9), shade(base, 1.06), shade(base, 1.2), shade(base, 0.82));
    }
    p.speckle(0, 0, 16, 16, [shade(base, 1.18), shade(base, 0.8), '#6cbb52'], 0.45);
    // Blades.
    p.set(3, 4, '#6cbb52');
    p.set(4, 5, '#6cbb52');
    p.set(10, 9, '#3d7a2c');
    p.set(11, 8, '#3d7a2c');
    p.set(7, 13, '#69b350');
  }),
  grass_side: P((p) => {
    const dirt = '#8b5a2b';
    p.rect(0, 0, 16, 16, dirt);
    p.speckle(0, 0, 16, 16, [shade(dirt, 1.1), shade(dirt, 0.86), '#6b421e'], 0.4);
    // The grass cap, with a ragged lower edge.
    const green = '#4f9b3a';
    const depth = 4 + p.rng.int(0, 2);
    for (let x = 0; x < 16; x++) {
      const d = depth + (p.rng.chance(0.4) ? 1 : 0) - (p.rng.chance(0.25) ? 1 : 0);
      for (let y = 0; y < d; y++) p.set(x, y, shade(green, 1 + (y / Math.max(1, depth)) * 0.12));
    }
    p.speckle(0, 0, 16, depth, [shade(green, 1.22), shade(green, 0.82)], 0.45);
    p.set(4, depth, green);
    p.set(11, depth, green);
    p.set(2, depth + 1, shade(green, 0.9));
  }),
  sand: P((p) => {
    const base = '#ddd3a0';
    p.rect(0, 0, 16, 16, base);
    p.speckle(0, 0, 16, 16, [shade(base, 0.93), shade(base, 1.05), '#cabd8a'], 0.4);
    // Ripples.
    p.rect(1, 5, 6, 1, shade(base, 0.9));
    p.rect(9, 11, 6, 1, shade(base, 0.92));
    p.rect(4, 13, 5, 1, shade(base, 1.06));
    // Pebbles.
    p.lump(11, 4, 1.3, '#c3b382', '#efe7bd', '#a2946a');
    p.lump(4, 9, 1.1, '#c3b382', '#efe7bd', '#a2946a');
  }),
  gravel: P((p) => {
    const base = '#8c8a85';
    p.rect(0, 0, 16, 16, shade(base, 0.72));
    for (let i = 0; i < 16; i++) {
      const x = p.rng.int(0, 14);
      const y = p.rng.int(0, 14);
      p.lump(x, y, p.rng.float(1.1, 2.1), base, shade(base, 1.22), shade(base, 0.68));
    }
    p.speckle(0, 0, 16, 16, [shade(base, 0.6), shade(base, 1.3)], 0.2);
  }),
  cobblestone: P((p) => {
    // Rubble stone: irregular stones bedded in dark mortar.
    const mortar = '#4f4f4f';
    p.rect(0, 0, 16, 16, mortar);
    const stones: Array<[number, number, number, number]> = [
      [0, 0, 7, 6],
      [8, 0, 8, 5],
      [0, 7, 5, 6],
      [6, 6, 6, 6],
      [13, 6, 3, 6],
      [0, 13, 8, 3],
      [9, 13, 7, 3],
    ];
    for (const [x, y, w, h] of stones) {
      const tone = p.rng.pick(['#8b8b8b', '#828282', '#949494', '#787878']);
      p.rect(x, y, w, h, tone);
      // Knock the corners off so the stones look broken, not bricked.
      if (w > 3 && h > 3) {
        if (p.rng.chance(0.3)) p.clear(x, y, 1, 1);
        if (p.rng.chance(0.3)) p.clear(x + w - 1, y, 1, 1);
        if (p.rng.chance(0.25)) p.clear(x, y + h - 1, 1, 1);
        if (p.rng.chance(0.25)) p.clear(x + w - 1, y + h - 1, 1, 1);
      }
      // Lit top-left edge, shadowed bottom-right edge.
      for (let i = 1; i < w - 1; i++) p.set(x + i, y, shade(tone, 1.2));
      for (let i = 0; i < h - 1; i++) p.set(x, y + i, shade(tone, 1.1));
      for (let i = 1; i < w - 1; i++) p.set(x + i, y + h - 1, shade(tone, 0.72));
      for (let i = 0; i < h - 1; i++) p.set(x + w - 1, y + i, shade(tone, 0.78));
      p.speckle(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2), [shade(tone, 1.08), shade(tone, 0.9)], 0.3);
    }
  }),
  coal_ore: P((p) => {
    rockBase(p);
    orePocket(p, 5, 5, 2.1, '#1c1c1c', '#3d3d3d', '#111111');
    orePocket(p, 11, 9, 1.8, '#1c1c1c', '#3d3d3d', '#111111');
    orePocket(p, 8, 13, 1.1, '#232323', '#454545', '#141414');
  }),
  iron_ore: P((p) => {
    rockBase(p);
    orePocket(p, 4, 6, 2.0, '#d7a883', '#f0cbb0', '#a9785a');
    orePocket(p, 10, 4, 1.5, '#d7a883', '#f0cbb0', '#a9785a');
    orePocket(p, 11, 11, 2.0, '#c99a78', '#e5b89a', '#96714f');
  }),
  gold_ore: P((p) => {
    rockBase(p);
    orePocket(p, 5, 5, 2.2, '#f0c33c', '#ffe680', '#b98d16');
    orePocket(p, 11, 10, 2.0, '#f0c33c', '#ffe680', '#b98d16');
  }),
  diamond_ore: P((p) => {
    rockBase(p);
    orePocket(p, 5, 6, 2.1, '#4fe0dc', '#c9fffd', '#2aa8a6');
    orePocket(p, 11, 10, 1.7, '#4fe0dc', '#c9fffd', '#2aa8a6');
  }),
  sulfur_ore: P((p) => {
    rockBase(p);
    orePocket(p, 5, 5, 2.3, '#e8d24a', '#fbf3a8', '#a89420');
    orePocket(p, 11, 10, 2.1, '#e8d24a', '#fbf3a8', '#a89420');
    p.set(8, 13, '#f3e06a');
  }),
  sulfur_crystal: P((p) => {
    const base = '#3b3524';
    p.rect(0, 0, 16, 16, base);
    p.speckle(0, 0, 16, 16, [shade(base, 1.18), shade(base, 0.84)], 0.5);
    // Faceted crystal in the middle.
    const gem: Array<[number, number]> = [
      [8, 3], [9, 4], [10, 5], [11, 6], [10, 7], [9, 8], [8, 9], [7, 8], [6, 7], [5, 6], [6, 5], [7, 4],
    ];
    for (const [x, y] of gem) p.set(x, y, '#d9c437');
    for (const [x, y] of [[8, 4], [7, 5], [9, 5], [8, 5], [7, 6], [8, 6], [7, 7]]) p.set(x, y, '#f4e878');
    p.set(7, 5, '#fffbd0');
    p.set(8, 6, '#fffbd0');
    p.set(9, 4, '#a89420');
    p.set(5, 6, '#a89420');
    // Small shards around it.
    p.set(3, 12, '#c9b52f');
    p.set(3, 11, '#e8d24a');
    p.set(12, 3, '#c9b52f');
    p.set(12, 2, '#e8d24a');
  }),
  lava: P((p) => {
    const crust = '#5a1d0c';
    p.rect(0, 0, 16, 16, crust);
    p.speckle(0, 0, 16, 16, ['#6e2410', '#47150a'], 0.45);
    // Glowing veins.
    const vein: Array<[number, number]> = [
      [2, 2], [3, 3], [4, 3], [5, 4], [6, 5], [7, 5], [8, 6], [9, 6], [10, 7], [11, 8], [12, 9],
    ];
    for (const [x, y] of vein) {
      p.set(x, y, '#e0641d');
      p.set(x, y + 1, '#b83a14');
    }
    p.set(5, 3, '#ffb43c');
    p.set(9, 5, '#ffb43c');
    p.set(7, 4, '#ffd76a');
    p.set(11, 7, '#ffd76a');
    p.set(6, 4, '#fff0b0');
    // Hot pools.
    p.blob(13, 3, 1.6, '#e0641d', '#7a2a10');
    p.set(13, 3, '#ffb43c');
    p.blob(3, 12, 1.4, '#e0641d', '#7a2a10');
  }),
  water: P((p) => {
    p.rect(0, 0, 16, 16, 'rgba(40,104,198,0.82)');
    p.speckle(0, 0, 16, 16, ['rgba(54,128,224,0.82)', 'rgba(30,84,170,0.82)'], 0.32);
    p.rect(1, 4, 7, 1, 'rgba(160,212,255,0.75)');
    p.rect(9, 10, 6, 1, 'rgba(160,212,255,0.7)');
    p.rect(4, 13, 4, 1, 'rgba(160,212,255,0.55)');
    p.rect(11, 6, 3, 1, 'rgba(160,212,255,0.5)');
  }),
  bedrock: P((p) => {
    p.rect(0, 0, 16, 16, '#2f2f2f');
    for (let i = 0; i < 26; i++) {
      const x = p.rng.int(0, 14);
      const y = p.rng.int(0, 14);
      p.rect(x, y, p.rng.int(1, 4), p.rng.int(1, 3), p.rng.pick(['#575757', '#202020', '#454545', '#141414']));
    }
    p.speckle(0, 0, 16, 16, ['#6a6a6a', '#1a1a1a'], 0.2);
  }),
  log_side: P((p) => {
    const base = '#5a3f22';
    p.rect(0, 0, 16, 16, base);
    // Bark grooves.
    for (let x = 0; x < 16; x += 3) {
      p.rect(x, 0, 1, 16, '#4a3319');
      if (p.rng.chance(0.7)) p.rect(x + 1, p.rng.int(0, 11), 1, p.rng.int(3, 6), '#6a4b28');
      if (p.rng.chance(0.4)) p.rect(x + 2, p.rng.int(2, 13), 1, p.rng.int(2, 4), '#3d2a15');
    }
    p.rect(0, 0, 16, 1, '#7a5730');
    p.rect(0, 15, 16, 1, '#3d2a15');
    // A knot.
    p.lump(11, 6, 1.6, '#4a3319', '#6a4b28', '#33220f');
    p.set(11, 6, '#3d2a15');
  }),
  log_top: P((p) => {
    const base = '#9c7440';
    p.rect(0, 0, 16, 16, base);
    for (let r = 7; r > 0; r -= 2) {
      p.rect(8 - r, 8 - r, r * 2, r * 2, r % 4 === 1 ? '#8a6435' : '#b0834a');
      p.rect(8 - r, 8 - r, r * 2, 1, '#bb8d52');
    }
    p.rect(7, 7, 2, 2, '#6b4a29');
    p.set(7, 7, '#54381f');
    // Radial splits.
    p.line(8, 8, 2, 3, '#7a5730');
    p.line(8, 8, 14, 12, '#7a5730');
  }),
  leaves: P((p) => {
    p.clear(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (p.rng.chance(0.14)) continue;
        const c = p.rng.pick(['#3f7a2c', '#4c8f34', '#356828', '#579c3c', '#2f6a22']);
        p.set(x, y, c);
      }
    }
    // Sunlit leaves.
    for (let i = 0; i < 8; i++) {
      const x = p.rng.int(0, 15);
      const y = p.rng.int(0, 15);
      p.set(x, y, '#6cb04a');
      if (p.rng.chance(0.5)) p.set(x + 1, y, '#5aa942');
    }
    // Deep shadow.
    for (let i = 0; i < 6; i++) p.set(p.rng.int(0, 15), p.rng.int(0, 15), '#2b5c1e');
  }),
  planks: P((p) => {
    const base = '#a97b45';
    p.rect(0, 0, 16, 16, base);
    for (let y = 0; y < 16; y += 4) {
      p.rect(0, y, 16, 3, shade(base, 1.08));
      p.rect(0, y + 3, 16, 1, '#7d5a32');
      for (let i = 0; i < 5; i++) {
        p.set(p.rng.int(0, 15), y + p.rng.int(0, 2), shade(base, p.rng.float(0.86, 1.14)));
      }
      // Grain.
      p.rect(p.rng.int(0, 12), y + 1, p.rng.int(3, 6), 1, shade(base, 0.92));
    }
    // Board seams.
    p.rect(6, 0, 1, 4, '#8a6338');
    p.rect(11, 8, 1, 4, '#8a6338');
    p.rect(3, 12, 1, 4, '#8a6338');
    // A knot.
    p.lump(12, 2, 1.1, '#8a6338', '#a97b45', '#6b4a29');
  }),
  torch: P((p) => {
    // The torch is drawn as a post (two pixels wide in the middle of the
    // tile), so the stick has to stay vertical and centred.
    p.clear(0, 0, 16, 16);
    // Stick.
    p.rect(7, 8, 2, 8, '#6b4a29');
    p.rect(7, 8, 1, 8, '#825733');
    p.rect(8, 8, 1, 8, '#54371d');
    p.set(7, 15, '#432c16');
    // Flame.
    p.rect(7, 5, 2, 3, '#e07a1e');
    p.rect(6, 6, 4, 2, '#e07a1e');
    p.rect(7, 4, 2, 3, '#ffb43c');
    p.rect(7, 5, 2, 2, '#ffd24a');
    p.set(7, 4, '#fff3b8');
    p.set(8, 5, '#fff3b8');
    p.set(7, 3, '#ffe680');
    p.set(8, 2, '#ffb43c');
    p.set(6, 6, '#b8560f');
    p.set(9, 6, '#b8560f');
  }),
  glass: P((p) => {
    p.clear(0, 0, 16, 16);
    // A faint pane of glass.
    p.rect(1, 1, 14, 14, 'rgba(150,198,236,0.28)');
    const frame = 'rgba(198,228,255,0.9)';
    p.rect(0, 0, 16, 1, frame);
    p.rect(0, 15, 16, 1, frame);
    p.rect(0, 0, 1, 16, frame);
    p.rect(15, 0, 1, 16, frame);
    p.rect(1, 1, 14, 1, 'rgba(255,255,255,0.45)');
    p.rect(1, 14, 14, 1, 'rgba(120,170,210,0.5)');
    // Diagonal glint.
    for (let i = 0; i < 7; i++) {
      p.set(3 + i, 3 + i, 'rgba(255,255,255,0.65)');
      p.set(4 + i, 3 + i, 'rgba(255,255,255,0.35)');
    }
    p.rect(10, 9, 1, 4, 'rgba(255,255,255,0.3)');
  }),
  brick: P((p) => {
    const mortar = '#c9b8a6';
    p.rect(0, 0, 16, 16, mortar);
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const offset = row % 2 === 0 ? 0 : 4;
      for (let i = 0; i < 2; i++) {
        const x = (offset + i * 8) % 16;
        const w = offset + i * 8 + 8 > 16 ? 16 - x : 8;
        const tone = p.rng.pick(['#9c5b43', '#a9634a', '#8f5139', '#a05a40']);
        p.rect(x, y, w, 3, tone);
        p.rect(x, y, w, 1, shade(tone, 1.18));
        p.rect(x, y + 2, w, 1, shade(tone, 0.86));
      }
      p.speckle(0, y, 16, 3, ['#8a4f3a', '#b06a50'], 0.18);
    }
  }),
  steel_block: P((p) => {
    const base = '#9aa3ab';
    p.rect(0, 0, 16, 16, base);
    p.speckle(0, 0, 16, 16, [shade(base, 1.1), shade(base, 0.9)], 0.28);
    // Bevel.
    p.rect(0, 0, 16, 2, '#c3ccd4');
    p.rect(0, 0, 2, 16, '#b3bcc4');
    p.rect(0, 14, 16, 2, '#6e767d');
    p.rect(14, 0, 2, 16, '#7d858c');
    // Rivets.
    for (const [x, y] of [[3, 3], [11, 3], [3, 11], [11, 11]] as const) {
      p.rect(x, y, 2, 2, '#d7dee4');
      p.set(x, y, '#f0f4f8');
      p.set(x + 1, y + 1, '#8b949c');
    }
  }),
  sulfur_brick: P((p) => {
    const mortar = '#efe6b8';
    p.rect(0, 0, 16, 16, mortar);
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const offset = row % 2 === 0 ? 0 : 4;
      for (let i = 0; i < 2; i++) {
        const x = (offset + i * 8) % 16;
        const w = offset + i * 8 + 8 > 16 ? 16 - x : 8;
        const tone = p.rng.pick(['#c9b437', '#d3be42', '#bda82f']);
        p.rect(x, y, w, 3, tone);
        p.rect(x, y, w, 1, shade(tone, 1.14));
        p.rect(x, y + 2, w, 1, shade(tone, 0.88));
      }
    }
    p.speckle(0, 0, 16, 16, ['#d8c452', '#b8a32c'], 0.16);
  }),
  charger: P((p) => {
    const frame = '#3c4650';
    p.rect(0, 0, 16, 16, frame);
    p.speckle(0, 0, 16, 16, ['#48535e', '#333c45'], 0.28);
    p.rect(0, 0, 16, 1, '#5a6773');
    p.rect(0, 15, 16, 1, '#28313a');
    p.rect(1, 1, 14, 14, '#2b333b');
    p.rect(2, 2, 12, 12, '#3f4a55');
    // Screen.
    p.rect(3, 3, 10, 6, '#1d2b26');
    p.rect(3, 3, 10, 1, '#7fd1a8');
    p.rect(4, 4, 8, 1, '#a8e8c8');
    p.set(5, 6, '#7fd1a8');
    p.set(9, 6, '#57a87e');
    // Charge symbol.
    p.rect(6, 7, 4, 5, '#dfe8ef');
    p.rect(7, 5, 2, 6, '#dfe8ef');
    p.set(7, 6, '#7fd1a8');
    // Bolts.
    for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]] as const) p.set(x, y, '#7d8a96');
  }),
  smelter: P((p) => {
    const stone = '#4a4239';
    p.rect(0, 0, 16, 16, stone);
    p.speckle(0, 0, 16, 16, ['#554c42', '#3e382f'], 0.32);
    // Frame.
    p.rect(0, 0, 16, 2, '#6a5f52');
    p.rect(0, 2, 1, 12, '#5c5246');
    p.rect(15, 2, 1, 12, '#3e382f');
    p.rect(0, 13, 16, 3, '#3e382f');
    // Chimney.
    p.rect(6, 2, 4, 3, '#6a5f52');
    p.rect(6, 2, 4, 1, '#7d7161');
    // Mouth.
    p.rect(2, 6, 12, 7, '#241f1a');
    p.rect(3, 7, 10, 6, '#8a2c0d');
    p.rect(4, 8, 8, 5, '#e0641d');
    p.rect(5, 9, 6, 4, '#ffb03a');
    p.rect(6, 10, 4, 3, '#ffe9a8');
    p.set(5, 12, '#fff8dc');
    // Grate.
    p.rect(2, 12, 12, 1, '#2c2620');
  }),
  beacon: P((p) => {
    const frame = '#2f3a44';
    p.rect(0, 0, 16, 16, frame);
    p.speckle(0, 0, 16, 16, ['#3a4752', '#26303a'], 0.28);
    p.rect(1, 1, 14, 14, '#1d2730');
    p.rect(2, 2, 12, 12, '#26333d');
    // Core.
    p.blob(8, 8, 3.4, '#57e0d6', '#2a9c96');
    p.blob(8, 8, 1.8, '#d6fffb', '#57e0d6');
    p.set(7, 6, '#ffffff');
    // Bolts.
    for (const [x, y] of [[0, 0], [14, 0], [0, 14], [14, 14]] as const) {
      p.rect(x, y, 2, 2, '#6f7d88');
      p.set(x, y, '#8b99a4');
    }
  }),
  lamp: P((p) => {
    const frame = '#6b5320';
    p.rect(0, 0, 16, 16, frame);
    p.rect(1, 1, 14, 14, '#f2c14e');
    p.rect(2, 2, 12, 12, '#ffd97a');
    p.rect(4, 4, 8, 8, '#fff3c4');
    p.rect(6, 6, 4, 4, '#ffffff');
    // Frame bars.
    for (let i = 0; i < 4; i++) {
      p.rect(i * 4, 0, 1, 16, '#8a6a2a');
      p.rect(0, i * 4, 16, 1, '#8a6a2a');
    }
    p.rect(0, 0, 16, 1, '#a08030');
    p.rect(0, 15, 16, 1, '#4a3814');
  }),
  ash: P((p) => {
    const base = '#5d5a57';
    p.rect(0, 0, 16, 16, base);
    p.speckle(0, 0, 16, 16, ['#67635f', '#514e4b', '#6f6b66'], 0.55);
    for (let i = 0; i < 6; i++) {
      p.lump(p.rng.int(1, 14), p.rng.int(1, 14), p.rng.float(1.0, 1.8), '#46433f', '#6a6662', '#33312e');
    }
  }),
  deepslate: P((p) => {
    const base = '#3c4149';
    p.rect(0, 0, 16, 16, base);
    // Layers.
    for (let y = 0; y < 16; y += 3) {
      p.rect(0, y, 16, 1, shade(base, p.rng.float(0.85, 1.12)));
    }
    p.speckle(0, 0, 16, 16, ['#454b55', '#333840', '#4a505a'], 0.4);
    p.rect(3, 4, 5, 4, '#353a42');
    p.rect(9, 10, 4, 3, '#4a505a');
  }),
  sulfur_sand: P((p) => {
    const base = '#ded089';
    p.rect(0, 0, 16, 16, base);
    p.speckle(0, 0, 16, 16, [shade(base, 0.93), shade(base, 1.05), '#c9b95f'], 0.45);
    // Sulfur flecks.
    for (let i = 0; i < 10; i++) {
      const x = p.rng.int(0, 15);
      const y = p.rng.int(0, 15);
      p.set(x, y, '#e8d24a');
      if (p.rng.chance(0.5)) p.set(x + 1, y, '#f2df74');
    }
    p.rect(6, 6, 3, 2, '#c2ac45');
  }),
  fungus: P((p) => {
    p.clear(0, 0, 16, 16);
    // Stalk.
    p.rect(7, 9, 2, 7, '#c8bda0');
    p.rect(7, 9, 1, 7, '#ded4b8');
    p.rect(8, 9, 1, 7, '#a89e83');
    // Cap.
    p.rect(5, 6, 6, 3, '#e8d24a');
    p.rect(4, 7, 8, 2, '#e8d24a');
    p.rect(5, 5, 6, 1, '#f6ec9a');
    p.rect(4, 8, 8, 1, '#a89420');
    p.set(6, 6, '#fffbd0');
    p.set(9, 7, '#fffbd0');
    p.set(3, 10, '#e8d24a');
    p.set(12, 11, '#e8d24a');
  }),
  crystal_shard: P((p) => {
    p.clear(0, 0, 16, 16);
    // Three spikes.
    p.rect(7, 2, 2, 13, '#d9c437');
    p.rect(7, 2, 1, 13, '#f0e26a');
    p.rect(6, 6, 1, 8, '#a89420');
    p.rect(4, 9, 2, 6, '#c9b52f');
    p.rect(4, 9, 1, 6, '#e8d24a');
    p.rect(10, 8, 2, 7, '#c9b52f');
    p.rect(10, 8, 1, 7, '#e8d24a');
    p.set(7, 2, '#fffbd0');
    p.set(7, 3, '#fffbd0');
  }),
  mossy_stone: P((p) => {
    const base = '#7d7d7d';
    rockBase(p, base);
    for (let i = 0; i < 14; i++) {
      const x = p.rng.int(0, 15);
      const y = p.rng.int(0, 15);
      p.blob(x, y, p.rng.float(1.1, 2.3), '#4d7c38', '#3c6a2b');
    }
    // Hanging strands.
    for (let i = 0; i < 5; i++) {
      const x = p.rng.int(0, 15);
      const y = p.rng.int(0, 12);
      p.rect(x, y, 1, p.rng.int(2, 4), '#456f31');
    }
  }),
  iron_block: P((p) => {
    const base = '#d8d8dc';
    p.rect(0, 0, 16, 16, base);
    p.speckle(0, 0, 16, 16, [shade(base, 1.05), shade(base, 0.93)], 0.28);
    p.rect(0, 0, 16, 1, '#f4f4f8');
    p.rect(0, 15, 16, 1, '#a8a8b0');
    p.rect(0, 0, 1, 16, '#ececf2');
    p.rect(15, 0, 1, 16, '#a8a8b0');
    p.set(4, 4, '#ffffff');
    p.set(11, 11, '#b0b0b8');
  }),
  gold_block: P((p) => {
    const base = '#f0c33c';
    p.rect(0, 0, 16, 16, base);
    p.speckle(0, 0, 16, 16, [shade(base, 1.08), shade(base, 0.9)], 0.3);
    p.rect(0, 0, 16, 1, '#ffe89a');
    p.rect(0, 15, 16, 1, '#b48c14');
    p.rect(0, 0, 1, 16, '#ffe07a');
    p.rect(15, 0, 1, 16, '#b48c14');
    p.set(4, 4, '#fff6c8');
    p.set(11, 11, '#c99a1c');
  }),
  sulfur_block: P((p) => {
    const base = '#e8d24a';
    p.rect(0, 0, 16, 16, base);
    p.speckle(0, 0, 16, 16, [shade(base, 1.08), shade(base, 0.9)], 0.32);
    p.rect(0, 0, 16, 1, '#fbf3a8');
    p.rect(0, 15, 16, 1, '#a89420');
    p.rect(0, 0, 1, 16, '#f4e26a');
    p.rect(15, 0, 1, 16, '#a89420');
    p.set(5, 5, '#fffbd0');
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

const ICON_SIZE = 32;

/** Every icon is drawn on a 16x16 pixel grid and scaled up. */
const GRID = 16;

class PixelGrid {
  private readonly cells: Array<string | null> = new Array(GRID * GRID).fill(null);

  set(x: number, y: number, color: string): void {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    this.cells[y * GRID + x] = color;
  }

  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return null;
    return this.cells[y * GRID + x];
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, color);
    }
  }

  /** A 45 degree handle. */
  diag(x0: number, y0: number, x1: number, y1: number, color: string, shadeColor?: string): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      this.set(x, y, color);
      if (shadeColor) this.set(x, y + 1, shadeColor);
    }
  }

  /** A soft outline so the silhouette reads on the dark hotbar. */
  outline(color = 'rgba(0,0,0,0.55)'): void {
    const copy = this.cells.slice();
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (copy[y * GRID + x]) continue;
        const near =
          (x > 0 && copy[y * GRID + x - 1]) ||
          (x < GRID - 1 && copy[y * GRID + x + 1]) ||
          (y > 0 && copy[(y - 1) * GRID + x]) ||
          (y < GRID - 1 && copy[(y + 1) * GRID + x]);
        if (near) this.set(x, y, color);
      }
    }
  }

  blit(ctx: Ctx, scale = 2): void {
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const c = this.cells[y * GRID + x];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }
}

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

/* ------------------------------------------------------------------ */
/* Tool sprites                                                        */
/* ------------------------------------------------------------------ */

interface Metal {
  base: string;
  light: string;
  dark: string;
}

const METAL: Record<string, Metal> = {
  wood: { base: '#8a5a2b', light: '#a9713a', dark: '#5f3d1c' },
  stone: { base: '#8a8a8a', light: '#a4a4a4', dark: '#616161' },
  iron: { base: '#d8d8dc', light: '#f6f6fa', dark: '#9a9aa2' },
  steel: { base: '#9aa3ab', light: '#c6cfd7', dark: '#667079' },
  diamond: { base: '#4fe0dc', light: '#c9fffd', dark: '#229c9a' },
  sulfur: { base: '#e8d24a', light: '#fbf3a8', dark: '#a89420' },
};

const HANDLE = { base: '#8a5a2b', dark: '#5f3d1c' };

/** A pickaxe: a wide arc on top, a handle down to the right. */
function drawPickaxe(g: PixelGrid, metal: Metal): void {
  // Head.
  g.rect(3, 1, 5, 1, metal.light);
  g.rect(1, 2, 9, 1, metal.base);
  g.rect(0, 3, 11, 1, metal.base);
  g.rect(0, 4, 1, 1, metal.dark);
  g.rect(10, 4, 1, 1, metal.dark);
  g.set(2, 2, metal.light);
  g.set(9, 3, metal.dark);
  // Handle.
  g.diag(8, 4, 13, 10, HANDLE.base, HANDLE.dark);
  g.set(14, 11, HANDLE.dark);
  g.set(15, 12, HANDLE.dark);
}

/** An axe: a blade on the left, a handle down to the right. */
function drawAxe(g: PixelGrid, metal: Metal): void {
  // A crescent blade on the left.
  g.rect(2, 1, 4, 1, metal.light);
  g.rect(1, 2, 6, 1, metal.light);
  g.rect(0, 3, 7, 2, metal.base);
  g.rect(1, 5, 5, 1, metal.base);
  g.rect(2, 6, 3, 1, metal.dark);
  g.rect(3, 7, 2, 1, metal.dark);
  g.set(0, 3, metal.light);
  g.set(6, 4, metal.dark);
  g.set(5, 5, metal.dark);
  g.diag(6, 4, 12, 11, HANDLE.base, HANDLE.dark);
  g.set(13, 12, HANDLE.dark);
  g.set(14, 13, HANDLE.dark);
}

/** A shovel: a spade on top, a handle down to the right. */
function drawShovel(g: PixelGrid, metal: Metal): void {
  g.rect(1, 1, 5, 1, metal.light);
  g.rect(0, 2, 7, 2, metal.base);
  g.rect(1, 4, 5, 1, metal.base);
  g.rect(2, 5, 3, 1, metal.dark);
  g.rect(3, 6, 1, 1, metal.dark);
  g.set(1, 2, metal.light);
  g.set(6, 3, metal.dark);
  g.diag(6, 4, 12, 11, HANDLE.base, HANDLE.dark);
  g.set(13, 12, HANDLE.dark);
  g.set(14, 13, HANDLE.dark);
}

/** A sword: the blade points to the top right. */
function drawSword(g: PixelGrid, metal: Metal): void {
  for (let i = 0; i < 9; i++) {
    const x = 13 - i;
    const y = 2 + i;
    g.set(x, y, metal.base);
    g.set(x - 1, y, i < 7 ? metal.light : metal.base);
  }
  g.set(13, 1, metal.light);
  g.set(12, 2, metal.light);
  // Guard.
  g.rect(3, 11, 5, 1, '#8a6338');
  g.rect(4, 12, 3, 1, '#6b4a29');
  // Grip.
  g.diag(2, 13, 0, 15, '#6b4a29');
  g.set(0, 15, '#f2c14e');
}

/** The sulfur drill: a machine with a glowing bit. */
function drawDrill(g: PixelGrid): void {
  const steel = METAL.steel;
  // Motor housing.
  g.rect(3, 3, 6, 1, steel.light);
  g.rect(2, 4, 8, 5, steel.base);
  g.rect(2, 9, 8, 1, steel.dark);
  g.rect(2, 4, 1, 5, steel.light);
  g.rect(9, 4, 1, 5, steel.dark);
  // Charge window.
  g.rect(3, 5, 3, 3, '#241f19');
  g.rect(4, 6, 2, 2, METAL.sulfur.base);
  g.set(4, 6, METAL.sulfur.light);
  // Chuck.
  g.rect(10, 5, 2, 3, '#39424b');
  g.rect(10, 5, 2, 1, '#5d6771');
  // Spiral bit.
  for (let i = 0; i < 5; i++) {
    g.set(12 + i, 5 + i, METAL.sulfur.base);
    g.set(12 + i, 6 + i, METAL.sulfur.light);
    g.set(13 + i, 7 + i, METAL.sulfur.dark);
  }
  g.set(15, 9, METAL.sulfur.light);
  // Grip and trigger.
  g.rect(4, 10, 3, 4, '#4a525a');
  g.rect(4, 10, 1, 4, '#667079');
  g.rect(7, 11, 2, 1, '#f2c14e');
}

/* ------------------------------------------------------------------ */
/* Material sprites                                                    */
/* ------------------------------------------------------------------ */

function drawNugget(g: PixelGrid, base: string, light: string, dark: string): void {
  const shape: Array<[number, number]> = [
    [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4],
    [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5],
    [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6], [12, 6],
    [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [12, 7],
    [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8],
    [5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [10, 9],
    [6, 10], [7, 10], [8, 10], [9, 10],
  ];
  for (const [x, y] of shape) g.set(x, y, base);
  // Lit top-left facet.
  g.rect(6, 4, 3, 1, light);
  g.rect(5, 5, 3, 1, light);
  g.set(4, 6, light);
  g.set(5, 6, light);
  g.set(5, 7, light);
  g.set(6, 5, light);
  // Shadowed bottom-right facet.
  g.rect(9, 9, 2, 1, dark);
  g.rect(10, 8, 2, 1, dark);
  g.rect(11, 7, 2, 1, dark);
  g.set(8, 10, dark);
  g.set(9, 8, dark);
  g.set(12, 6, dark);
  g.set(11, 6, dark);
}

function drawIngot(g: PixelGrid, base: string, light: string, dark: string): void {
  g.rect(4, 8, 8, 1, light);
  g.rect(3, 9, 10, 1, base);
  g.rect(2, 10, 12, 2, base);
  g.rect(3, 12, 10, 1, dark);
  g.rect(4, 13, 8, 1, dark);
  g.set(5, 9, light);
  g.set(6, 8, light);
  g.set(11, 10, dark);
}

/* ------------------------------------------------------------------ */
/* Icon painters                                                       */
/* ------------------------------------------------------------------ */

const gridIcons: Record<string, (g: PixelGrid) => void> = {
  // ---- tools -------------------------------------------------------
  pickaxe_wood: (g) => drawPickaxe(g, METAL.wood),
  pickaxe_stone: (g) => drawPickaxe(g, METAL.stone),
  pickaxe_iron: (g) => drawPickaxe(g, METAL.iron),
  pickaxe_steel: (g) => drawPickaxe(g, METAL.steel),
  pickaxe_diamond: (g) => drawPickaxe(g, METAL.diamond),
  axe_iron: (g) => drawAxe(g, METAL.iron),
  axe_steel: (g) => drawAxe(g, METAL.steel),
  shovel_iron: (g) => drawShovel(g, METAL.iron),
  shovel_steel: (g) => drawShovel(g, METAL.steel),
  sword_iron: (g) => drawSword(g, METAL.iron),
  sword_steel: (g) => drawSword(g, METAL.steel),
  drill_sulfur: (g) => drawDrill(g),

  // ---- placeables with a sprite of their own ------------------------
  torch: (g) => {
    // A burning torch: the stick and the flame, like the block sprite.
    g.rect(7, 9, 2, 6, '#6b4a29');
    g.rect(7, 9, 1, 6, '#825733');
    g.rect(8, 9, 1, 6, '#54371d');
    g.rect(6, 5, 4, 4, '#e07a1e');
    g.rect(7, 3, 2, 6, '#ffb43c');
    g.rect(7, 5, 2, 3, '#ffd24a');
    g.set(7, 3, '#fff3b8');
    g.set(8, 5, '#fff3b8');
    g.set(7, 6, '#fffbd0');
    g.set(6, 8, '#b8560f');
  },

  // ---- raw materials ------------------------------------------------
  coal: (g) => {
    g.rect(5, 6, 6, 1, '#151515');
    g.rect(4, 7, 8, 3, '#151515');
    g.rect(5, 10, 6, 1, '#0d0d0d');
    g.rect(6, 7, 2, 1, '#3d3d3d');
    g.set(10, 8, '#2a2a2a');
    g.set(5, 9, '#0a0a0a');
    g.set(9, 6, '#262626');
  },
  raw_iron: (g) => drawNugget(g, '#c99a78', '#e5b89a', '#a9785a'),
  raw_gold: (g) => drawNugget(g, '#d8b64a', '#ffe680', '#a98f2c'),
  iron_ingot: (g) => drawIngot(g, '#d8d8dc', '#f4f4f8', '#a8a8b0'),
  gold_ingot: (g) => drawIngot(g, '#f0c33c', '#ffe89a', '#b48c14'),
  steel_ingot: (g) => drawIngot(g, '#9aa3ab', '#c6cfd7', '#667079'),
  clay: (g) => {
    g.rect(5, 7, 6, 4, '#a89890');
    g.rect(4, 8, 8, 3, '#a89890');
    g.rect(6, 7, 3, 1, '#c4b6ae');
    g.set(5, 10, '#8b7d76');
    g.set(10, 9, '#8b7d76');
  },
  stick: (g) => {
    g.diag(4, 12, 11, 4, '#8a5a2b');
    g.set(5, 12, '#5f3d1c');
    g.set(10, 5, '#a9713a');
  },
  diamond: (g) => {
    g.rect(7, 3, 2, 1, '#4fe0dc');
    g.rect(6, 4, 4, 1, '#4fe0dc');
    g.rect(5, 5, 6, 1, '#4fe0dc');
    g.rect(5, 6, 6, 1, '#3fc9c6');
    g.rect(6, 7, 4, 1, '#4fe0dc');
    g.rect(7, 8, 2, 1, '#2aa8a6');
    g.set(8, 9, '#2aa8a6');
    g.set(7, 4, '#c9fffd');
    g.set(6, 5, '#c9fffd');
    g.set(7, 5, '#c9fffd');
    g.set(8, 5, '#2aa8a6');
    g.set(9, 6, '#2aa8a6');
  },
  sulfur_dust: (g) => {
    g.rect(5, 9, 6, 1, '#e8d24a');
    g.rect(3, 10, 10, 2, '#e8d24a');
    g.rect(4, 12, 8, 1, '#c9b52f');
    g.rect(6, 8, 4, 1, '#f2df74');
    g.set(6, 10, '#fbf3a8');
    g.set(9, 11, '#f2df74');
    g.set(4, 12, '#a89420');
  },
  sulfur_crystal: (g) => {
    // A tall faceted crystal: bright left facet, dark right facet.
    g.set(7, 2, '#fffbd0');
    g.rect(7, 3, 2, 1, '#f0e26a');
    g.rect(6, 4, 4, 1, '#f0e26a');
    g.rect(6, 5, 2, 5, '#e8d24a');
    g.rect(8, 5, 2, 5, '#c9b52f');
    g.rect(5, 6, 6, 3, '#e8d24a');
    g.rect(6, 6, 3, 3, '#f6ec9a');
    g.rect(9, 6, 2, 3, '#a89420');
    g.rect(6, 9, 4, 1, '#c9b52f');
    g.rect(7, 10, 2, 1, '#a89420');
    g.rect(4, 8, 1, 3, '#c9b52f');
    g.rect(11, 7, 1, 3, '#c9b52f');
    g.set(7, 3, '#fffbd0');
    g.set(6, 4, '#fffbd0');
  },

  // ---- gear ----------------------------------------------------------
  gas_mask: (g) => {
    g.rect(3, 5, 10, 5, '#3b444d');
    g.rect(4, 10, 8, 2, '#2c343b');
    g.rect(2, 4, 2, 2, '#2c343b');
    g.rect(12, 4, 2, 2, '#2c343b');
    g.rect(4, 6, 3, 3, '#1a2228');
    g.rect(9, 6, 3, 3, '#1a2228');
    g.set(5, 7, '#57e0d6');
    g.set(10, 7, '#57e0d6');
    g.set(6, 8, '#d6fffb');
    g.set(5, 11, '#7fd1a8');
  },
  lantern: (g) => {
    g.rect(7, 1, 2, 2, '#6b5320');
    g.rect(4, 3, 8, 2, '#8a6a2a');
    g.rect(5, 5, 6, 7, '#ffd97a');
    g.rect(6, 7, 4, 4, '#fff3c4');
    g.rect(6, 6, 4, 1, '#f2c14e');
    g.rect(4, 12, 8, 2, '#6b5320');
    g.set(5, 5, '#fff3c4');
  },
  scanner: (g) => {
    g.rect(4, 6, 8, 7, '#39424b');
    g.rect(5, 7, 6, 4, '#1b2a2c');
    g.rect(5, 8, 5, 3, '#57e0d6');
    g.set(6, 9, '#d6fffb');
    g.rect(9, 9, 1, 2, '#f2c14e');
    g.rect(6, 3, 4, 3, '#2a323a');
    g.rect(5, 2, 6, 1, '#f2c14e');
    g.rect(4, 13, 8, 1, '#2a323a');
  },
  backpack: (g) => {
    g.rect(5, 2, 6, 2, '#4e341c');
    g.rect(4, 4, 8, 3, '#6b4a2c');
    g.rect(3, 7, 10, 7, '#8a6338');
    g.rect(3, 7, 10, 1, '#a87c4a');
    g.rect(5, 10, 6, 2, '#c9b28a');
    g.rect(7, 10, 2, 2, '#f2c14e');
    g.rect(4, 5, 8, 1, '#4e341c');
  },
  thruster: (g) => {
    const steel = METAL.steel;
    // Tank.
    g.rect(5, 2, 6, 1, steel.light);
    g.rect(4, 3, 8, 6, steel.base);
    g.rect(4, 3, 1, 6, steel.light);
    g.rect(11, 3, 1, 6, steel.dark);
    g.rect(5, 9, 6, 1, steel.dark);
    // Fins.
    g.rect(2, 6, 2, 3, '#39424b');
    g.rect(1, 8, 2, 1, '#2b3238');
    g.rect(12, 6, 2, 3, '#39424b');
    g.rect(13, 8, 2, 1, '#2b3238');
    // Nozzle.
    g.rect(5, 10, 6, 2, '#39424b');
    g.rect(6, 12, 4, 1, '#2b3238');
    // Flame.
    g.rect(7, 13, 2, 1, '#f2c14e');
    g.rect(6, 14, 4, 1, '#ff8b3a');
    g.set(7, 15, '#ffe680');
  },
  battery_cell: (g) => {
    g.rect(6, 2, 4, 2, '#c3ccd4');
    g.rect(4, 4, 8, 10, '#3c4650');
    g.rect(5, 5, 6, 8, '#57e07a');
    g.rect(5, 5, 6, 2, '#a8ffb8');
    g.rect(9, 6, 1, 6, '#3c4650');
    g.set(4, 4, '#d7dee4');
  },

  // ---- food ----------------------------------------------------------
  beef: (g) => {
    g.rect(4, 6, 8, 6, '#b04a3a');
    g.rect(5, 5, 6, 2, '#f0d8b0');
    g.rect(6, 8, 3, 2, '#d2695a');
    g.rect(4, 11, 8, 1, '#8a3529');
    g.set(5, 5, '#fff0d8');
  },
  bread: (g) => {
    g.rect(4, 7, 8, 5, '#c08a45');
    g.rect(5, 6, 6, 1, '#d9a45c');
    g.rect(5, 9, 6, 1, '#a06f36');
    g.rect(6, 7, 1, 1, '#e0b478');
    g.set(4, 11, '#8a5f2c');
  },
};

const iconCache = new Map<string, string>();

/**
 * True when the item has a sprite of its own (a block cube, a tool or a
 * material). Items without one fall back to a generic gem, which used to
 * happen to every tool in the game.
 */
export function hasItemIcon(itemId: string): boolean {
  return BLOCK_ITEM_TO_BLOCK.has(itemId) || gridIcons[itemId] !== undefined;
}

/** Returns a data URL for the icon of an item id. */
export function itemIcon(itemId: string): string {
  const cached = iconCache.get(itemId);
  if (cached) return cached;

  const { canvas, ctx } = iconCanvas();
  const painter = gridIcons[itemId];
  if (painter) {
    // Items with a sprite of their own (tools, materials, the torch).
    const grid = new PixelGrid();
    painter(grid);
    grid.outline();
    grid.blit(ctx);
  } else {
    const blockId = BLOCK_ITEM_TO_BLOCK.get(itemId);
    if (blockId !== undefined) {
      const def = blockDef(blockId);
      cubeIcon(ctx, def.top, def.side, def.bottom);
    } else {
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
