import * as THREE from 'three';
import { ROBOT } from '../core/constants';
import { Block, blockDef, isValuable } from '../world/blocks';
import { itemDef } from '../game/items';
import { moveEntity, unstick } from './physics';
import { animateRobot, applyLight, createRobotModel, type CharacterParts } from './models';
import type { Game } from '../game/game';

export type RobotState =
  | 'FOLLOW'
  | 'MINE'
  | 'RETURN'
  | 'CHARGE'
  | 'SCAN'
  | 'IDLE'
  | 'OFFLINE';

export interface CargoItem {
  id: string;
  count: number;
}

const SCAN_INTERVAL = 22;

/**
 * BOLT-7 — the robot miner.
 * It follows the player, autonomously drills ore veins, ferries the loot back
 * and needs charging when the battery runs dry.
 */
export class Robot {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;

  state: RobotState = 'FOLLOW';
  battery = ROBOT.batteryMax;
  cargo: CargoItem[] = [];
  /** Set while the robot is drilling a specific block. */
  private mineTarget: { x: number; y: number; z: number; block: number } | null = null;
  private mineTimer = 0;
  private stateTimer = 0;
  private scanTimer = 0;
  private oreScanTimer = 0;
  private stuckTimer = 0;
  private wanderAngle = 0;
  /** Blocks revealed by the last scanner ping. */
  readonly revealed = new Map<string, THREE.Vector3>();
  private revealTimer = 0;

  readonly model: CharacterParts;
  private walkPhase = 0;

  constructor(private readonly game: Game) {
    this.model = createRobotModel();
  }

  get cargoCount(): number {
    return this.cargo.reduce((sum, c) => sum + c.count, 0);
  }

  get cargoLimit(): number {
    return this.game.hasUpgrade('cargo_expansion') ? ROBOT.cargoSlots * 2 : ROBOT.cargoSlots;
  }

  get batteryMax(): number {
    return this.game.hasUpgrade('battery_pack') ? ROBOT.batteryMax * 1.6 : ROBOT.batteryMax;
  }

  spawnAt(x: number, y: number, z: number): void {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.state = 'FOLLOW';
    this.battery = this.batteryMax;
    this.mineTarget = null;
    this.mineTimer = 0;
    this.stuckTimer = 0;
  }

  /** Give the robot a battery cell. */
  recharge(amount: number): void {
    this.battery = Math.min(this.batteryMax, this.battery + amount);
    this.game.stats.add('robotCharges');
    this.game.notify('BOLT-7 recharged.', 'good');
    this.game.audio.beep(520, 0.12);
  }

  recall(): void {
    if (!this.game.hasUpgrade('beacon_link')) {
      this.game.notify('BOLT-7 is out of range. Build a Beacon to link.', 'warn');
      return;
    }
    const player = this.game.player;
    const angle = Math.random() * Math.PI * 2;
    this.pos.set(
      player.pos.x + Math.cos(angle) * 2,
      player.pos.y + 1,
      player.pos.z + Math.sin(angle) * 2,
    );
    unstick(this.game.world, this.pos, ROBOT.width / 2, ROBOT.height);
    this.state = 'FOLLOW';
    this.mineTarget = null;
    this.game.notify('BOLT-7 recalled.', 'good');
  }

  /** Trigger a scanner ping that reveals nearby ore. */
  scan(): void {
    const radius = this.game.hasUpgrade('scanner_mk2') ? ROBOT.scanRadius * 1.55 : ROBOT.scanRadius;
    this.scanTimer = SCAN_INTERVAL;
    this.state = 'SCAN';
    this.stateTimer = 1.1;
    this.game.audio.beep(880, 0.16);

    const world = this.game.world;
    const px = Math.floor(this.pos.x);
    const py = Math.floor(this.pos.y);
    const pz = Math.floor(this.pos.z);
    const r = Math.ceil(radius);
    this.revealed.clear();
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dy, dz);
          if (d > radius) continue;
          const b = world.getBlock(px + dx, py + dy, pz + dz);
          if (!isValuable(b)) continue;
          if (b === Block.SULFUR_CRYSTAL && !this.game.hasUpgrade('beacon_tether')) continue;
          const key = `${px + dx},${py + dy},${pz + dz}`;
          this.revealed.set(key, new THREE.Vector3(px + dx, py + dy, pz + dz));
        }
      }
    }
    this.game.notify(
      `BOLT-7 pinged ${this.revealed.size} ore deposit${this.revealed.size === 1 ? '' : 's'}.`,
      'good',
    );
  }

  update(dt: number): void {
    const world = this.game.world;
    const player = this.game.player;

    this.scanTimer = Math.max(0, this.scanTimer - dt);
    this.revealTimer = Math.max(0, this.revealTimer - dt);
    if (this.revealTimer === 0) this.revealed.clear();

    const distToPlayer = this.pos.distanceTo(player.pos);

    // ---------- battery ----------
    if (this.battery <= 0) {
      this.state = 'OFFLINE';
    } else if (this.state !== 'OFFLINE') {
      const drain =
        this.state === 'MINE'
          ? ROBOT.batteryDrainMining
          : this.state === 'FOLLOW' || this.state === 'RETURN'
            ? ROBOT.batteryDrainFollow
            : ROBOT.batteryDrainIdle;
      this.battery = Math.max(0, this.battery - drain * dt);
    }

    // Recharge when standing on a charge station.
    const below = world.getBlock(
      Math.floor(this.pos.x),
      Math.floor(this.pos.y - 0.6),
      Math.floor(this.pos.z),
    );
    const near = world.getBlock(
      Math.floor(this.pos.x),
      Math.floor(this.pos.y),
      Math.floor(this.pos.z),
    );
    if (below === Block.CHARGER || near === Block.CHARGER) {
      this.battery = Math.min(this.batteryMax, this.battery + ROBOT.batteryRecharge * dt);
      if (this.state === 'CHARGE') this.stateTimer = 0;
    } else if (this.state === 'IDLE' || this.state === 'CHARGE') {
      this.battery = Math.min(this.batteryMax, this.battery + 1.1 * dt);
    }

    this.stateTimer = Math.max(0, this.stateTimer - dt);

    switch (this.state) {
      case 'OFFLINE':
        this.vel.x = 0;
        this.vel.z = 0;
        break;
      case 'SCAN':
        this.vel.x = 0;
        this.vel.z = 0;
        if (this.stateTimer <= 0) this.state = 'FOLLOW';
        break;
      case 'MINE':
        this.updateMining(dt);
        break;
      case 'RETURN':
        this.updateReturn(dt, distToPlayer);
        break;
      case 'CHARGE':
        this.updateCharge(dt);
        break;
      case 'IDLE':
        this.updateIdle(dt);
        break;
      case 'FOLLOW':
      default:
        this.updateFollow(dt, distToPlayer);
        break;
    }

    // ---------- physics ----------
    this.vel.y -= 26 * dt;
    if (this.vel.y < -45) this.vel.y = -45;
    const result = moveEntity(
      world,
      this.pos,
      this.vel,
      ROBOT.width / 2,
      ROBOT.height,
      dt,
      1.05,
    );
    if (result.grounded) {
      this.vel.y = 0;
    }
    if (result.hitWall) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.6) {
        this.wanderAngle += Math.PI * (0.6 + Math.random() * 0.8);
        this.stuckTimer = 0;
        this.mineTarget = null;
        if (this.state === 'MINE') this.state = 'FOLLOW';
      }
    } else {
      this.stuckTimer = 0;
    }
    if (this.pos.y < 1) {
      this.pos.set(player.pos.x, player.pos.y + 1, player.pos.z);
    }

    // ---------- presentation ----------
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGroundish()) this.walkPhase += dt * speed * 1.8;
    const targetYaw = Math.atan2(this.vel.x, this.vel.z);
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * 6);

    this.model.group.position.copy(this.pos);
    this.model.group.rotation.y = this.yaw;
    animateRobot(
      this.model,
      this.walkPhase,
      speed,
      this.state === 'MINE' ? 1 : 0,
      performance.now() / 1000,
    );

    const light = world.lightAt(
      Math.floor(this.pos.x),
      Math.floor(this.pos.y + 1),
      Math.floor(this.pos.z),
    );
    const factor = 0.25 + (light / 15) * 0.85;
    applyLight(this.model, factor);

    // Battery LED colour reflects charge level.
    const led = this.model.parts.chargeLed as THREE.Mesh | undefined;
    if (led) {
      const mat = led.material as THREE.MeshBasicMaterial;
      const ratio = this.battery / this.batteryMax;
      if (ratio > 0.5) mat.color.setHex(0x7fd1a8);
      else if (ratio > 0.2) mat.color.setHex(0xf2c14e);
      else mat.color.setHex(0xe2584d);
    }
    const antenna = this.model.parts.antennaTip as THREE.Mesh | undefined;
    if (antenna) {
      const mat = antenna.material as THREE.MeshBasicMaterial;
      mat.color.setHex(this.state === 'OFFLINE' ? 0x663333 : 0x7fd1a8);
    }
  }

  private onGroundish(): boolean {
    return this.vel.y === 0;
  }

  private steerTo(target: THREE.Vector3, dt: number, speed: number): void {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) {
      this.vel.x *= 0.6;
      this.vel.z *= 0.6;
      return;
    }
    const nx = dx / len;
    const nz = dz / len;
    const accel = 12;
    this.vel.x += (nx * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (nz * speed - this.vel.z) * Math.min(1, accel * dt);
  }

  private updateFollow(dt: number, dist: number): void {
    const player = this.game.player;
    if (dist > ROBOT.farDistance) {
      // Too far — catch up quickly.
      this.steerTo(player.pos, dt, ROBOT.speed * 1.55);
    } else if (dist > ROBOT.followDistance) {
      this.steerTo(player.pos, dt, ROBOT.speed);
    } else {
      this.vel.x *= 0.7;
      this.vel.z *= 0.7;
    }

    // Automatically look for work, but only scan for ore every few frames.
    this.oreScanTimer -= dt;
    if (this.oreScanTimer <= 0) {
      this.oreScanTimer = 0.4;
      if (this.cargo.length < this.cargoLimit && this.findOreTarget()) {
        this.state = 'MINE';
        this.stateTimer = 0;
      }
    }
  }

  private updateIdle(dt: number): void {
    this.wanderAngle += (Math.random() - 0.5) * dt * 3;
    this.vel.x = Math.cos(this.wanderAngle) * ROBOT.speed * 0.35;
    this.vel.z = Math.sin(this.wanderAngle) * ROBOT.speed * 0.35;
    if (this.stateTimer <= 0) {
      this.state = 'FOLLOW';
      this.stateTimer = 0;
    }
  }

  private updateCharge(dt: number): void {
    const charger = this.findCharger();
    if (charger) {
      const d = this.pos.distanceTo(charger);
      if (d > 1.4) this.steerTo(charger, dt, ROBOT.speed);
      else {
        this.vel.x *= 0.5;
        this.vel.z *= 0.5;
      }
      if (this.battery >= this.batteryMax - 0.5) this.state = 'FOLLOW';
    } else {
      this.state = 'FOLLOW';
    }
  }

  private findCharger(): THREE.Vector3 | null {
    const world = this.game.world;
    const r = 16;
    const px = Math.floor(this.pos.x);
    const py = Math.floor(this.pos.y);
    const pz = Math.floor(this.pos.z);
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.hypot(dx, dy, dz) > r) continue;
          if (world.getBlock(px + dx, py + dy, pz + dz) === Block.CHARGER) {
            return new THREE.Vector3(px + dx + 0.5, py + dy + 1, pz + dz + 0.5);
          }
        }
      }
    }
    return null;
  }

  private findOreTarget(): boolean {
    if (this.mineTarget) return true;
    const world = this.game.world;
    const radius = ROBOT.sightRadius;
    const px = Math.floor(this.pos.x);
    const py = Math.floor(this.pos.y);
    const pz = Math.floor(this.pos.z);
    const r = Math.ceil(radius);
    let best: { x: number; y: number; z: number; block: number } | null = null;
    let bestDist = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dy, dz);
          if (d > radius) continue;
          const b = world.getBlock(px + dx, py + dy, pz + dz);
          if (!isValuable(b)) continue;
          if (d < bestDist) {
            bestDist = d;
            best = { x: px + dx, y: py + dy, z: pz + dz, block: b };
          }
        }
      }
    }
    if (best) {
      this.mineTarget = best;
      this.mineTimer = 0;
      return true;
    }
    return false;
  }

  private updateMining(dt: number): void {
    const world = this.game.world;
    if (!this.mineTarget || !this.findOreTarget()) {
      this.mineTarget = null;
      this.state = this.cargo.length > 0 ? 'RETURN' : 'FOLLOW';
      return;
    }
    const target = new THREE.Vector3(
      this.mineTarget.x + 0.5,
      this.mineTarget.y + 0.5,
      this.mineTarget.z + 0.5,
    );
    const dist = this.pos.distanceTo(target);
    if (dist > 24) {
      // The vein is out of reach — look for a closer one instead.
      this.mineTarget = null;
      this.state = 'FOLLOW';
      return;
    }
    if (dist > ROBOT.miningRange) {
      this.steerTo(target, dt, ROBOT.speed);
      this.mineTimer = 0;
    } else {
      this.vel.x *= 0.5;
      this.vel.z *= 0.5;
      this.mineTimer += dt;
      const speedUp = this.game.hasUpgrade('drill_overhaul') ? 1.5 : 1;
      const needed = (ROBOT.miningTime / speedUp) * 0.5;
      if (this.mineTimer >= needed) {
        this.mineTimer = 0;
        const block = world.getBlock(this.mineTarget.x, this.mineTarget.y, this.mineTarget.z);
        if (block === this.mineTarget.block && isValuable(block)) {
          const def = blockDef(block);
          this.game.robotBrokeBlock(this.mineTarget.x, this.mineTarget.y, this.mineTarget.z, block);
          this.addCargo(def.drop, def.dropCount || 1);
          this.game.audio.dig(def.sound);
          this.game.spawnBlockParticles(
            new THREE.Vector3(
              this.mineTarget.x + 0.5,
              this.mineTarget.y + 0.5,
              this.mineTarget.z + 0.5,
            ),
            block,
            6,
          );
        }
        this.mineTarget = null;
        if (this.cargo.length >= this.cargoLimit) {
          this.state = 'RETURN';
        }
      }
    }
  }

  private addCargo(id: string, count: number): void {
    if (!id) return;
    const existing = this.cargo.find((c) => c.id === id);
    if (existing) {
      existing.count += count;
      return;
    }
    this.cargo.push({ id, count });
  }

  private updateReturn(dt: number, dist: number): void {
    const player = this.game.player;
    if (dist < 2.6) {
      this.vel.x *= 0.5;
      this.vel.z *= 0.5;
      this.deliverCargo();
      this.state = 'FOLLOW';
      return;
    }
    this.steerTo(player.pos, dt, ROBOT.speed * 1.2);
    if (this.stateTimer > 12) {
      // Could not reach the player, give up and try again later.
      this.stateTimer = 0;
      this.state = 'FOLLOW';
    }
  }

  /** Hand the cargo over to the player. */
  deliverCargo(): void {
    if (this.cargo.length === 0) return;
    let delivered = 0;
    for (const item of this.cargo) {
      const left = this.game.inventory.add(item.id, item.count);
      delivered += item.count - left;
      item.count = left;
    }
    this.cargo = this.cargo.filter((c) => c.count > 0);
    if (delivered > 0) {
      this.game.stats.add('robotCargo', delivered);
      this.game.notify(`BOLT-7 delivered ${delivered} item${delivered === 1 ? '' : 's'}.`, 'good');
      this.game.audio.beep(760, 0.1);
    }
  }

  toJSON(): unknown {
    return {
      pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z },
      state: this.state,
      battery: this.battery,
      cargo: this.cargo,
    };
  }

  loadJSON(data: {
    pos?: { x: number; y: number; z: number };
    state?: RobotState;
    battery?: number;
    cargo?: CargoItem[];
  }): void {
    if (data.pos) this.pos.set(data.pos.x, data.pos.y, data.pos.z);
    if (data.state) this.state = data.state;
    if (typeof data.battery === 'number') this.battery = data.battery;
    if (data.cargo) this.cargo = data.cargo;
  }
}

/** Exposed for the HUD: a short human readable label for the robot state. */
export function robotStateLabel(state: RobotState): string {
  switch (state) {
    case 'FOLLOW':
      return 'Following';
    case 'MINE':
      return 'Drilling';
    case 'RETURN':
      return 'Hauling loot';
    case 'CHARGE':
      return 'Charging';
    case 'SCAN':
      return 'Scanning';
    case 'IDLE':
      return 'Idle';
    case 'OFFLINE':
      return 'Offline';
    default:
      return 'Unknown';
  }
}

export function robotItemName(id: string): string {
  return itemDef(id).name;
}
