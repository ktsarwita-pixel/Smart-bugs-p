import * as THREE from 'three';
import { PLAYER } from '../core/constants';
import { Block, blockDef } from '../world/blocks';
import { moveEntity, unstick } from './physics';
import {
  animateSwing,
  animateWalk,
  applyLight,
  createMinerModel,
  type CharacterParts,
} from './models';
import type { Input } from '../core/input';
import type { Game } from '../game/game';

export interface MineTarget {
  x: number;
  y: number;
  z: number;
  block: number;
}

export class Player {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;

  health = PLAYER.maxHealth;
  maxHealth = PLAYER.maxHealth;
  stamina = PLAYER.maxStamina;
  /** Sulfur toxicity, 0..100. */
  gas = 0;

  onGround = false;
  inWater = false;
  sprinting = false;
  crouching = false;
  fallDistance = 0;
  invulnerability = 0;
  dead = false;

  viewMode: 'first' | 'third' = 'first';
  /** Seconds left before the player respawns after dying. */
  deathTimer = 0;
  mineTarget: MineTarget | null = null;
  mineProgress = 0;
  swingTimer = 0;
  walkPhase = 0;
  lanternOn = false;
  respawnPoint = new THREE.Vector3();

  readonly model: CharacterParts;
  private digSoundTimer = 0;
  private lastGasTick = 0;

  constructor(private readonly game: Game) {
    this.model = createMinerModel();
    this.model.group.visible = false;
  }

  get eyeHeight(): number {
    return this.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
  }

  get eyePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  /** Direction the player is looking. */
  get lookDirection(): THREE.Vector3 {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
  }

  spawnAt(x: number, y: number, z: number): void {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.respawnPoint.set(x, y, z);
    this.health = this.maxHealth;
    this.stamina = PLAYER.maxStamina;
    this.gas = 0;
    this.dead = false;
    this.fallDistance = 0;
  }

  get hasMask(): boolean {
    const gear = this.game.inventory.gear;
    return !!gear && gear.id === 'gas_mask';
  }

  get hasLantern(): boolean {
    const gear = this.game.inventory.gear;
    return !!gear && gear.id === 'lantern';
  }

  damage(amount: number, cause: string): void {
    if (this.invulnerability > 0 || this.dead) return;
    this.health -= amount;
    this.invulnerability = PLAYER.invulnerability;
    this.game.audio.hurt();
    this.game.flashDamage();
    if (this.health <= 0) {
      this.health = 0;
      this.die(cause);
    }
  }

  private die(cause: string): void {
    this.dead = true;
    this.deathTimer = 2.6;
    this.game.stats.deaths++;
    const lost = Math.floor(this.game.credits * 0.1);
    this.game.credits -= lost;
    this.game.notify(`You were killed by ${cause}. Lost ${lost} credits.`, 'bad');
    this.game.onPlayerDied(cause);
  }

  respawnAtHome(): void {
    const spawn = this.game.world.terrain.spawn;
    this.pos.set(spawn.x, spawn.y + 1, spawn.z);
    this.vel.set(0, 0, 0);
    this.health = this.maxHealth;
    this.stamina = PLAYER.maxStamina;
    this.gas = 0;
    this.dead = false;
    this.fallDistance = 0;
    unstick(this.game.world, this.pos, PLAYER.width / 2, PLAYER.height);
  }

  update(dt: number, input: Input): void {
    const world = this.game.world;
    const settings = this.game.settings;

    // ---- look ----
    const sensitivity = 0.0022 * (settings.sensitivity ?? 1);
    this.yaw -= input.state.lookX * sensitivity;
    const dy = input.state.lookY * sensitivity;
    this.pitch += settings.invertY ? dy : -dy;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));

    if (this.dead) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.respawnAtHome();
      this.updateCamera();
      return;
    }

    // ---- environment ----
    const feetBlock = world.getBlock(
      Math.floor(this.pos.x),
      Math.floor(this.pos.y + 0.4),
      Math.floor(this.pos.z),
    );
    const headBlock = world.getBlock(
      Math.floor(this.pos.x),
      Math.floor(this.pos.y + this.eyeHeight),
      Math.floor(this.pos.z),
    );
    this.inWater = feetBlock === Block.WATER || headBlock === Block.WATER;
    const inLava = feetBlock === Block.LAVA || headBlock === Block.LAVA;

    // ---- movement ----
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3()
      .addScaledVector(forward, input.state.moveForward)
      .addScaledVector(right, input.state.moveRight);
    const moving = wish.lengthSq() > 0.0001;
    if (moving) wish.normalize();

    this.crouching = input.state.crouch && this.onGround && !this.inWater;
    const wantSprint = input.state.sprint && moving && !this.crouching && this.stamina > 1;
    this.sprinting = wantSprint;

    let speed = PLAYER.walkSpeed;
    if (this.crouching) speed = PLAYER.crouchSpeed;
    else if (this.sprinting) speed = PLAYER.sprintSpeed;
    if (this.inWater) speed = PLAYER.swimSpeed;
    if (this.game.hasUpgrade('deep_suit')) speed *= 1.05;

    const accel = this.onGround ? 16 : this.inWater ? 8 : 4;
    const targetX = wish.x * speed;
    const targetZ = wish.z * speed;
    this.vel.x += (targetX - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (targetZ - this.vel.z) * Math.min(1, accel * dt);

    if (!moving && this.onGround) {
      const friction = Math.max(0, 1 - 9 * dt);
      this.vel.x *= friction;
      this.vel.z *= friction;
    }

    // ---- jump / swim ----
    if (input.state.jump) {
      if (this.inWater) {
        this.vel.y = Math.min(this.vel.y + 22 * dt, 3.4);
      } else if (this.onGround && this.stamina > 5) {
        this.vel.y = PLAYER.jumpVelocity;
        this.stamina -= 6;
        this.onGround = false;
        if (this.game.hasUpgrade('thruster_pack') && this.game.inventory.gear?.id === 'thruster') {
          this.vel.y = PLAYER.jumpVelocity * 1.12;
        }
      }
    }
    if (this.game.hasUpgrade('thruster_pack') && this.game.inventory.gear?.id === 'thruster') {
      // Air jump (second jump) while holding jump and falling.
      if (input.state.jump && !this.onGround && this.vel.y < 0 && this.stamina > 10) {
        this.vel.y = PLAYER.jumpVelocity * 0.85;
        this.stamina -= 10;
        this.game.audio.beep(660, 0.08);
      }
    }

    // ---- gravity ----
    if (this.inWater) {
      this.vel.y -= 6 * dt;
      this.vel.y = Math.max(this.vel.y, -3.2);
    } else {
      this.vel.y -= PLAYER.gravity * dt;
      if (this.vel.y < -PLAYER.terminalVelocity) this.vel.y = -PLAYER.terminalVelocity;
    }

    // ---- integrate ----
    const height = this.crouching ? PLAYER.crouchHeight : PLAYER.height;
    const before = this.pos.y;
    const result = moveEntity(
      world,
      this.pos,
      this.vel,
      PLAYER.width / 2,
      height,
      dt,
      this.inWater ? 0 : PLAYER.stepHeight,
    );
    this.onGround = result.grounded;

    // Fall damage
    if (this.vel.y < 0 && !this.onGround) {
      this.fallDistance += before - this.pos.y;
    }
    if (result.landed) {
      const safe = PLAYER.fallSafeHeight;
      if (this.fallDistance > safe) {
        let dmg = (this.fallDistance - safe) * 1.7;
        if (this.game.hasUpgrade('deep_suit')) dmg *= 0.5;
        if (dmg > 0) this.damage(dmg, 'the fall');
      }
      this.fallDistance = 0;
      this.game.audio.step(this.sprinting ? 0.9 : 0.6);
    }
    if (this.onGround) this.fallDistance = 0;

    // ---- stamina ----
    if (this.sprinting) {
      this.stamina -= PLAYER.staminaDrain * dt;
    } else {
      this.stamina += PLAYER.staminaRegen * dt * (this.crouching ? 1.5 : 1);
    }
    this.stamina = Math.max(0, Math.min(PLAYER.maxStamina, this.stamina));

    // ---- gas / toxicity ----
    this.updateGas(dt);

    // ---- regen ----
    if (this.health < this.maxHealth && this.gas < 30 && this.stamina > 40) {
      this.health = Math.min(this.maxHealth, this.health + 0.35 * dt);
    }
    if (this.invulnerability > 0) this.invulnerability -= dt;

    // ---- hazards ----
    if (inLava) {
      this.damage(6 * dt, 'lava');
      this.gas = Math.min(100, this.gas + 20 * dt);
    }
    const feetDef = blockDef(feetBlock);
    if (feetDef.hazard === 'toxic') {
      this.gas = Math.min(100, this.gas + 25 * dt);
    }

    // ---- mining ----
    this.updateMining(dt, input);

    // ---- animation ----
    const horizontalSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && horizontalSpeed > 0.4) {
      this.walkPhase += dt * horizontalSpeed * 1.9;
    }
    this.model.group.position.copy(this.pos);
    this.model.group.rotation.y = this.yaw + Math.PI;
    animateWalk(this.model, this.walkPhase, horizontalSpeed);
    if (this.swingTimer > 0) {
      this.swingTimer -= dt;
      animateSwing(this.model, 1 - Math.max(0, this.swingTimer) / 0.28);
    }
    const lightFactor = 0.12 + (world.lightAt(
      Math.floor(this.pos.x),
      Math.floor(this.pos.y + 1),
      Math.floor(this.pos.z),
    ) / 15) * 0.95;
    applyLight(this.model, this.viewMode === 'third' ? lightFactor : 1);

    this.updateCamera();
  }

  private updateGas(dt: number): void {
    const world = this.game.world;
    let exposure = 0;
    const px = Math.floor(this.pos.x);
    const py = Math.floor(this.pos.y + 1);
    const pz = Math.floor(this.pos.z);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const b = world.getBlock(px + dx, py + dy, pz + dz);
          if (b === Block.SULFUR_ORE) exposure += 1;
          else if (b === Block.SULFUR_CRYSTAL || b === Block.SULFUR_BLOCK) exposure += 2.2;
          else if (b === Block.CRYSTAL_SHARD) exposure += 1.4;
          else if (b === Block.SULFUR_BRICK) exposure -= 0.8;
        }
      }
    }
    const depthFactor = py < 16 ? 1.4 : py < 26 ? 0.8 : 0.35;
    const raw = (exposure * 4.2 + depthFactor) * dt;
    const maskFactor = this.hasMask ? 0.25 : 1;
    this.gas = Math.max(0, Math.min(100, this.gas + raw * maskFactor - 7 * dt));

    if (this.gas > 62) {
      const severity = (this.gas - 62) / 38;
      const filter = this.game.hasUpgrade('gas_filter') ? 0.5 : 1;
      this.damage(1.9 * severity * filter * dt, 'sulfur fumes');
    }
    this.lastGasTick += dt;
  }

  private updateMining(dt: number, input: Input): void {
    const world = this.game.world;
    if (!input.state.mine) {
      this.mineTarget = null;
      this.mineProgress = 0;
      return;
    }

    const hit = world.raycast(this.eyePosition, this.lookDirection, PLAYER.reach);
    if (!hit) {
      this.mineTarget = null;
      this.mineProgress = 0;
      return;
    }

    const def = blockDef(hit.block);
    if (!def.solid || def.hardness <= 0) {
      this.mineTarget = null;
      this.mineProgress = 0;
      return;
    }

    if (
      !this.mineTarget ||
      this.mineTarget.x !== hit.x ||
      this.mineTarget.y !== hit.y ||
      this.mineTarget.z !== hit.z
    ) {
      this.mineTarget = { x: hit.x, y: hit.y, z: hit.z, block: hit.block };
      this.mineProgress = 0;
      this.swingTimer = 0.28;
    }

    const tool = this.game.currentTool();
    let speed = 1;
    if (tool && def.tool !== 'none') {
      speed = tool.def.tool?.type === def.tool ? tool.def.tool.speed : 0.4;
    }
    if (this.game.hasUpgrade('reinforced_pick')) speed *= 1.25;
    if (this.sprinting) speed *= 1.1;

    const breakTime = Math.max(0.07, (def.hardness * 1.45) / Math.max(0.2, speed));
    this.mineProgress += dt / breakTime;

    this.digSoundTimer -= dt;
    if (this.digSoundTimer <= 0) {
      this.digSoundTimer = 0.28;
      this.game.audio.dig(def.sound);
    }
    if (this.swingTimer <= 0) this.swingTimer = 0.28;

    if (this.mineProgress >= 1) {
      this.mineProgress = 0;
      this.mineTarget = null;
      this.game.breakBlock(hit.x, hit.y, hit.z, hit.block);
    }
  }

  private updateCamera(): void {
    const camera = this.game.camera;
    if (this.viewMode === 'first') {
      camera.position.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
    } else {
      const dir = this.lookDirection;
      camera.position.set(
        this.pos.x - dir.x * 4.2,
        this.pos.y + this.eyeHeight + 0.6 - dir.y * 1.2,
        this.pos.z - dir.z * 4.2,
      );
    }
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw;
    camera.rotation.x = this.pitch;
    camera.rotation.z = 0;
  }
}
