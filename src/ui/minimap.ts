import { Block } from '../world/blocks';
import { WORLD_X, WORLD_Z } from '../core/constants';
import type { Game } from '../game/game';

const BIOME_COLORS: Record<number, string> = {
  0: '#4f8c37',
  1: '#c9b178',
  2: '#6e675f',
};

const SIZE = 148;
const SCALE = 1.9;

/** Top-down minimap of the terrain around the player. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.canvas.className = 'mini-map';
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  render(game: Game): void {
    const ctx = this.ctx;
    const world = game.world;
    const player = game.player;
    const cx = player.pos.x;
    const cz = player.pos.z;
    const half = SIZE / 2;
    const step = 1 / SCALE;

    ctx.fillStyle = '#0b0908';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const px0 = Math.floor(cx - half * step);
    const pz0 = Math.floor(cz - half * step);
    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const wx = px0 + Math.floor(px * step);
        const wz = pz0 + Math.floor(py * step);
        if (wx < 0 || wz < 0 || wx >= WORLD_X || wz >= WORLD_Z) continue;
        const height = world.terrain.heightMap[wx + wz * WORLD_X];
        const biome = world.terrain.biomeMap[wx + wz * WORLD_X];
        let color = BIOME_COLORS[biome] ?? '#555';

        // Water / snow shading by height.
        if (height <= 31) color = '#2f5fa8';
        else if (height > 52) color = '#9a938a';

        // Simple slope shading.
        const h2 = world.terrain.heightMap[Math.min(WORLD_X - 1, wx + 1) + wz * WORLD_X];
        const shade = Math.max(-26, Math.min(26, (h2 - height) * 2));
        ctx.fillStyle = this.shade(color, shade);
        ctx.fillRect(px, py, 1, 1);
      }
    }

    // Revealed ore from the robot scanner.
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

  private shade(hex: string, amount: number): string {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (n & 255) + amount));
    return `rgb(${r},${g},${b})`;
  }
}

export { Block };
