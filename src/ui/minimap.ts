import { WORLD_X, WORLD_Z } from '../core/constants';
import type { Game } from '../game/game';

const BIOME_COLORS: Record<number, [number, number, number]> = {
  0: [79, 140, 55],
  1: [201, 177, 120],
  2: [110, 103, 95],
};

const SIZE = 148;
const SCALE = 1.9;

/** Pre-computed shading ramp: shade bucket -> packed rgb string. */
const SHADE_MIN = -26;
const SHADE_MAX = 26;
const SHADE_STEP = 2;
const SHADE_BUCKETS = Math.floor((SHADE_MAX - SHADE_MIN) / SHADE_STEP) + 1;
const WATER: [number, number, number] = [47, 95, 168];
const SNOW: [number, number, number] = [154, 147, 138];

function buildRamp(base: [number, number, number]): Uint8Array {
  const ramp = new Uint8Array(SHADE_BUCKETS * 3);
  for (let i = 0; i < SHADE_BUCKETS; i++) {
    const amount = SHADE_MIN + i * SHADE_STEP;
    ramp[i * 3] = Math.max(0, Math.min(255, base[0] + amount));
    ramp[i * 3 + 1] = Math.max(0, Math.min(255, base[1] + amount));
    ramp[i * 3 + 2] = Math.max(0, Math.min(255, base[2] + amount));
  }
  return ramp;
}

/** Top-down minimap of the terrain around the player. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  /** Off-screen pixel buffer for the terrain layer. */
  private readonly image: ImageData;
  private readonly pixels: Uint8ClampedArray;
  private readonly ramps = new Map<string, Uint8Array>();
  /** Last drawn position, so an unchanged map is not redrawn. */
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private lastRobotX = Number.NaN;
  private lastRobotZ = Number.NaN;
  private lastRevealed = -1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.canvas.className = 'mini-map';
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.image = this.ctx.createImageData(SIZE, SIZE);
    this.pixels = this.image.data;
  }

  private ramp(key: string, base: [number, number, number]): Uint8Array {
    let ramp = this.ramps.get(key);
    if (!ramp) {
      ramp = buildRamp(base);
      this.ramps.set(key, ramp);
    }
    return ramp;
  }

  render(game: Game): void {
    const ctx = this.ctx;
    const world = game.world;
    const player = game.player;
    const cx = player.pos.x;
    const cz = player.pos.z;

    // Nothing has moved since the last frame: redrawing 22k pixels for an
    // unchanged map is pure waste.
    const robot = game.robot;
    const moved =
      Math.abs(cx - this.lastX) > 0.35 ||
      Math.abs(cz - this.lastZ) > 0.35 ||
      Math.abs(robot.pos.x - this.lastRobotX) > 0.35 ||
      Math.abs(robot.pos.z - this.lastRobotZ) > 0.35 ||
      robot.revealed.size !== this.lastRevealed;
    if (!moved) return;
    this.lastX = cx;
    this.lastZ = cz;
    this.lastRobotX = robot.pos.x;
    this.lastRobotZ = robot.pos.z;
    this.lastRevealed = robot.revealed.size;
    const half = SIZE / 2;
    const step = 1 / SCALE;
    const heightMap = world.terrain.heightMap;
    const biomeMap = world.terrain.biomeMap;

    // --- terrain layer, written straight into the pixel buffer ---
    const px0 = Math.floor(cx - half * step);
    const pz0 = Math.floor(cz - half * step);
    const pixels = this.pixels;
    for (let py = 0; py < SIZE; py++) {
      const wz = pz0 + Math.floor(py * step);
      const rowBase = py * SIZE * 4;
      for (let px = 0; px < SIZE; px++) {
        const wx = px0 + Math.floor(px * step);
        const i = rowBase + px * 4;
        if (wx < 0 || wz < 0 || wx >= WORLD_X || wz >= WORLD_Z) {
          pixels[i] = 11;
          pixels[i + 1] = 9;
          pixels[i + 2] = 8;
          pixels[i + 3] = 255;
          continue;
        }
        const idx = wx + wz * WORLD_X;
        const height = heightMap[idx];
        const biome = biomeMap[idx];
        let base: [number, number, number];
        let rampKey: string;
        if (height <= 31) {
          base = WATER;
          rampKey = 'water';
        } else if (height > 52) {
          base = SNOW;
          rampKey = 'snow';
        } else {
          base = BIOME_COLORS[biome] ?? ([85, 85, 85] as [number, number, number]);
          rampKey = `biome${biome}`;
        }

        // Simple slope shading.
        const h2 = heightMap[Math.min(WORLD_X - 1, wx + 1) + wz * WORLD_X];
        let shade = (h2 - height) * 2;
        if (shade < SHADE_MIN) shade = SHADE_MIN;
        else if (shade > SHADE_MAX) shade = SHADE_MAX;
        const bucket = Math.round((shade - SHADE_MIN) / SHADE_STEP);
        const ramp = this.ramp(rampKey, base);
        const o = bucket * 3;
        pixels[i] = ramp[o];
        pixels[i + 1] = ramp[o + 1];
        pixels[i + 2] = ramp[o + 2];
        pixels[i + 3] = 255;
      }
    }
    ctx.putImageData(this.image, 0, 0);

    // --- overlays ---
    ctx.fillStyle = '#7fd1a8';
    for (const pos of game.robot.revealed.values()) {
      const px = (pos.x - cx) * SCALE + half;
      const py = (pos.z - cz) * SCALE + half;
      if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) continue;
      ctx.fillStyle = pos.y < 20 ? '#7fd1a8' : '#f2c14e';
      ctx.fillRect(px - 1, py - 1, 3, 3);
    }

    // Home base marker.
    const spawn = world.terrain.spawn;
    const sx = (spawn.x - cx) * SCALE + half;
    const sy = (spawn.z - cz) * SCALE + half;
    if (sx > 0 && sy > 0 && sx < SIZE && sy < SIZE) {
      ctx.fillStyle = '#e2584d';
      ctx.fillRect(sx - 2, sy - 2, 5, 5);
    }

    // Robot.
    const rx = (game.robot.pos.x - cx) * SCALE + half;
    const ry = (game.robot.pos.z - cz) * SCALE + half;
    ctx.fillStyle = '#7fd1a8';
    ctx.fillRect(rx - 1.5, ry - 1.5, 4, 4);

    // Player arrow.
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#f2c14e';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(3.5, 4);
    ctx.lineTo(0, 2);
    ctx.lineTo(-3.5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Frame.
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);
  }
}
