import * as THREE from 'three';
import { PLAYER, WORLD_X, WORLD_Z } from '../core/constants';
import { Block, blockDef } from '../world/blocks';
import { dustColor } from '../render/palette';
import { createStepState, moveEntity, unstick, type StepState } from './physics';
import {
  animateIdle,
  animateLand,
  animateLandRelease,
  animateSwing,
  animateWalk,
  applyLight,
  createMinerModel,
  createShadow,
  setHeldTool,
  updateShadow,
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
  /** Smooth step-up state: the miner glides up a ledge instead of hopping. */
  readonly stepState: StepState = createStepState();
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
  /** The block the miner is currently looking at (Block.AIR when none). */
  hoverBlock: number = Block.AIR;
  /** Where that block is, so the game can draw a selection box around it. */
  hoverTarget: { x: number; y: number; z: number } | null = null;
  swingTimer = 0;
  /** Counts down after a hard landing so the miner can squash. */
  landTimer = 0;
  private lastHeldId = '';
  walkPhase = 0;
  lanternOn = false;
  respawnPoint = new THREE.Vector3();

  readonly model: CharacterParts;
  /** The soft shadow under the miner. */
  readonly shadow: THREE.Mesh;
  private digSoundTimer = 0;
  /** Counts down to the next footstep. */
  private stepTimer = 0;
  private lastGasTick = 0;

  constructor(private readonly game: Game) {
    this.model = createMinerModel();
    this.model.group.visible = false;
    this.shadow = createShadow(0.4);
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

  /** Pull the miner back onto the map when they leave the world. */
  recoverFromVoid(): void {
    const spawn = this.game.world.terrain.spawn;
    this.pos.set(spawn.x, spawn.y, spawn.z);
    this.vel.set(0, 0, 0);
    this.fallDistance = 0;
    unstick(this.game.world, this.pos, PLAYER.width / 2, PLAYER.height);
    this.game.notify('You slipped out of the shaft — the company pulled you back.', 'warn');
    this.game.audio.beep(420, 0.12);
  }

  respawnAtHome(): void {
    const spawn = this.game.world.terrain.spawn;
    this.pos.set(spawn.x, spawn.y, spawn.z);
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

    // --- out-of-world guard ---
    // The map edges are open: without this the miner walks off the world and
    // falls forever, taking the whole chunk system with them.
    if (
      this.pos.y < -2 ||
      this.pos.x < 1 ||
      this.pos.z < 1 ||
      this.pos.x > WORLD_X - 1 ||
      this.pos.z > WORLD_Z - 1
    ) {
      this.recoverFromVoid();
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
      } else if ((this.onGround || this.stepState.climbing) && this.stamina > 5) {
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
    if (this.stepState.climbing) {
      // Gliding up a ledge: gravity would fight the climb, so it is skipped.
      this.vel.y = 0;
    } else if (this.inWater) {
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
      this.stepState,
    );
    const wasGrounded = this.onGround;
    this.onGround = result.grounded;

    // Fall damage
    if (this.vel.y < 0 && !this.onGround) {
      this.fallDistance += before - this.pos.y;
    }
    const landingSpeed = this.fallDistance;
    if (this.onGround && !wasGrounded) {
      // Touchdown. The damage is applied on the transition to grounded: the
      // proximity check can flag the ground a frame before the body actually
      // hits it, and waiting for the collision lost every fall entirely.
      const safe = PLAYER.fallSafeHeight;
      if (this.fallDistance > safe && !this.inWater) {
        // One point of health per block, like the games this is modelled on.
        let dmg = (this.fallDistance - safe) * PLAYER.fallDamagePerBlock;
        if (this.game.hasUpgrade('deep_suit')) dmg *= 0.5;
        if (dmg > 0) this.damage(dmg, 'the fall');
      }
      this.fallDistance = 0;
      this.game.audio.step(this.sprinting ? 0.9 : 0.6);
      // A hard landing squashes the miner for a moment.
      if (landingSpeed > 1.2) this.landTimer = 0.18;
    } else if (this.onGround) {
      this.fallDistance = 0;
    }

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

    // ---- what the miner is looking at ----
    const lookHit = world.raycast(this.eyePosition, this.lookDirection, PLAYER.reach);
    this.hoverBlock = lookHit ? lookHit.block : Block.AIR;
    this.hoverTarget = lookHit ? { x: lookHit.x, y: lookHit.y, z: lookHit.z } : null;

    // ---- mining ----
    this.updateMining(dt, input, lookHit);

    // ---- animation ----
    const horizontalSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && horizontalSpeed > 0.4) {
      this.walkPhase += dt * horizontalSpeed * 1.9;
    }

    // ---- footsteps: a step sound and a puff of dust ----
    if (this.onGround && horizontalSpeed > 0.9) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = this.sprinting ? 0.26 : 0.4;
        this.game.audio.step(this.sprinting ? 0.5 : 0.32);
        const under = this.game.world.getBlock(
          Math.floor(this.pos.x),
          Math.floor(this.pos.y - 0.2),
          Math.floor(this.pos.z),
        );
        this.game.spawnFootDust(
          new THREE.Vector3(this.pos.x, this.pos.y + 0.06, this.pos.z),
          under,
        );
      }
    } else {
      this.stepTimer = 0.12;
    }
    this.model.group.position.copy(this.pos);
    this.model.group.rotation.y = this.yaw + Math.PI;
    if (horizontalSpeed > 0.4 && this.onGround) {
      animateWalk(this.model, this.walkPhase, horizontalSpeed);
    } else {
      animateWalk(this.model, 0, 0);
      animateIdle(this.model, this.game.elapsed);
    }
    if (this.swingTimer > 0) {
      this.swingTimer -= dt;
      animateSwing(this.model, 1 - Math.max(0, this.swingTimer) / 0.28);
    } else {
      animateLandRelease(this.model);
    }

    // Landing squash.
    if (this.landTimer > 0) {
      this.landTimer -= dt;
      animateLand(this.model, this.landTimer / 0.18);
    }

    // The tool in the miner's hand.
    const held = this.game.inventory.getSelected();
    const heldId = held?.id ?? '';
    if (heldId !== this.lastHeldId) {
      this.lastHeldId = heldId;
      setHeldTool(this.model, heldId || null);
    }

    // The shadow stays on the ground.
    updateShadow(this.shadow, world, this.pos.x, this.pos.y, this.pos.z);
    this.shadow.visible = this.viewMode === 'third';
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

  private updateMining(
    dt: number,
    input: Input,
    hit: { x: number; y: number; z: number; block: number } | null,
  ): void {
    if (!input.state.mine) {
      this.mineTarget = null;
      this.mineProgress = 0;
      return;
    }

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
      // Chips flying off the block that is being mined.
      this.game.particles.spawn(
        new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5),
        dustColor(hit.block),
        2,
        1.4,
        0.3,
        14,
        0.45,
      );
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
    // A soft head bob while walking, and a dip when landing.
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const moving = this.onGround && speed > 0.6;
    const bob = moving ? Math.sin(this.walkPhase * 2) * 0.045 : 0;
    const sway = moving ? Math.sin(this.walkPhase) * 0.03 : 0;
    const dip = this.landTimer > 0 ? (this.landTimer / 0.18) * 0.22 : 0;

    if (this.viewMode === 'first') {
      camera.position.set(
        this.pos.x + sway * Math.cos(this.yaw),
        this.pos.y + this.eyeHeight + bob - dip,
        this.pos.z - sway * Math.sin(this.yaw),
      );
    } else {
      const dir = this.lookDirection;
      camera.position.set(
        this.pos.x - dir.x * 4.2,
        this.pos.y + this.eyeHeight + 0.6 - dir.y * 1.2 + bob - dip,
        this.pos.z - dir.z * 4.2,
      );
    }
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw;
    camera.rotation.x = this.pitch;
    camera.rotation.z = moving ? Math.sin(this.walkPhase) * 0.012 : 0;
  }
}
