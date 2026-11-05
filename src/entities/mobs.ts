import * as THREE from 'three';
import { MOB, WORLD_X, WORLD_Y, WORLD_Z } from '../core/constants';
import { Block } from '../world/blocks';
import { createStepState, moveEntity, type StepState } from './physics';
import type { Game } from '../game/game';

export type MobKind = 'crawler' | 'magmite';

interface MobModel {
  group: THREE.Group;
  legs: THREE.Object3D[];
  eyes: THREE.MeshBasicMaterial[];
  bodyMaterial: THREE.MeshBasicMaterial;
  baseColor: THREE.Color;
}

export interface Mob {
  kind: MobKind;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Smooth step-up state: the creature glides up a ledge. */
  stepState: StepState;
  yaw: number;
  health: number;
  maxHealth: number;
  attackCooldown: number;
  wanderTimer: number;
  wanderAngle: number;
  model: MobModel;
  hurtTimer: number;
}

function createMobModel(kind: MobKind): MobModel {
  const group = new THREE.Group();
  const legs: THREE.Object3D[] = [];
  const eyes: THREE.MeshBasicMaterial[] = [];

  const baseColor = new THREE.Color(kind === 'crawler' ? 0x4a3a5c : 0x7a3418);
  const bodyMaterial = new THREE.MeshBasicMaterial({ color: baseColor.getHex() });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.8), bodyMaterial);
  body.position.y = 0.42;
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.4), bodyMaterial);
  head.position.set(0, 0.44, 0.5);
  group.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: kind === 'crawler' ? 0xff4d4d : 0xffb03a });
  eyes.push(eyeMat);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.06), eyeMat);
    eye.position.set(side * 0.12, 0.5, 0.72);
    group.add(eye);
  }

  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Object3D();
    leg.position.set(i < 2 ? -0.2 : 0.2, 0.22, i % 2 === 0 ? -0.25 : 0.28);
    const limb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, 0.12), bodyMaterial);
    limb.position.y = -0.2;
    leg.add(limb);
    group.add(leg);
    legs.push(leg);
  }

  if (kind === 'magmite') {
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.18, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xff7a2a }),
    );
    core.position.set(0, 0.62, 0);
    group.add(core);
  }

  return { group, legs, eyes, bodyMaterial, baseColor };
}

/**
 * Cave dwellers: hostile creatures that spawn in the deep dark and hunt the
 * player. They can be fought with any tool.
 */
export class MobManager {
  readonly mobs: Mob[] = [];
  private group = new THREE.Group();
  private spawnTimer = 4;

  constructor(private readonly game: Game) {
    this.group.name = 'mobs';
  }

  attach(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  update(dt: number): void {
    const player = this.game.player;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = MOB.spawnInterval;
      if (this.mobs.length < MOB.maxMobs) this.trySpawn();
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      const dx = player.pos.x - mob.pos.x;
      const dy = player.pos.y - mob.pos.y;
      const dz = player.pos.z - mob.pos.z;
      const dist = Math.hypot(dx, dy, dz);

      // Despawn when far away.
      if (dist > MOB.despawnDistance) {
        this.remove(i);
        continue;
      }

      const chasing = dist < MOB.detectRange;
      if (chasing) {
        const len = Math.hypot(dx, dz) || 1;
        mob.vel.x += ((dx / len) * MOB.speed - mob.vel.x) * Math.min(1, 6 * dt);
        mob.vel.z += ((dz / len) * MOB.speed - mob.vel.z) * Math.min(1, 6 * dt);
        mob.yaw = Math.atan2(dx, dz);
      } else {
        mob.wanderTimer -= dt;
        if (mob.wanderTimer <= 0) {
          mob.wanderTimer = 2 + Math.random() * 3;
          mob.wanderAngle = Math.random() * Math.PI * 2;
        }
        mob.vel.x += (Math.cos(mob.wanderAngle) * MOB.speed * 0.4 - mob.vel.x) * Math.min(1, 3 * dt);
        mob.vel.z += (Math.sin(mob.wanderAngle) * MOB.speed * 0.4 - mob.vel.z) * Math.min(1, 3 * dt);
      }

      // Attack.
      mob.attackCooldown = Math.max(0, mob.attackCooldown - dt);
      if (dist < 1.5 && mob.attackCooldown <= 0) {
        mob.attackCooldown = MOB.attackCooldown;
        this.game.player.damage(MOB.attackDamage, mob.kind === 'crawler' ? 'a cave dweller' : 'a magmite');
        const kb = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(6);
        player.vel.add(kb);
        player.vel.y = Math.max(player.vel.y, 3.4);
        this.game.audio.hurt();
      }

      // Physics.
      mob.vel.y -= 26 * dt;
      const result = moveEntity(this.game.world, mob.pos, mob.vel, 0.32, 0.9, dt, 1.0, mob.stepState);
      if (result.grounded) mob.vel.y = 0;
      if (mob.pos.y < 1) {
        mob.pos.y = 20;
        mob.pos.x = player.pos.x + (Math.random() - 0.5) * 20;
        mob.pos.z = player.pos.z + (Math.random() - 0.5) * 20;
      }

      // Presentation.
      mob.model.group.position.copy(mob.pos);
      mob.model.group.rotation.y = mob.yaw;
      const speed = Math.hypot(mob.vel.x, mob.vel.z);
      mob.model.legs.forEach((leg, index) => {
        leg.rotation.x = Math.sin(this.game.time * 8 * Math.min(1, speed) + index * 1.6) * 0.7;
      });
      if (mob.hurtTimer > 0) {
        mob.hurtTimer -= dt;
        const flash = Math.sin(mob.hurtTimer * 40) > 0;
        mob.model.bodyMaterial.color.setHex(flash ? 0xffffff : mob.model.baseColor.getHex());
      }
      const light = this.game.world.lightAt(
        Math.floor(mob.pos.x),
        Math.floor(mob.pos.y + 1),
        Math.floor(mob.pos.z),
      );
      const factor = 0.35 + (light / 15) * 0.65;
      if (mob.hurtTimer <= 0) {
        mob.model.bodyMaterial.color.setRGB(
          mob.model.baseColor.r * factor,
          mob.model.baseColor.g * factor,
          mob.model.baseColor.b * factor,
        );
      }
      this.group.add(mob.model.group);
    }
  }

  /** Called when the player swings at a mob. */
  hit(mob: Mob, damage: number, fromX: number, fromZ: number): void {
    mob.health -= damage;
    mob.hurtTimer = 0.25;
    const dx = mob.pos.x - fromX;
    const dz = mob.pos.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    mob.vel.x += (dx / len) * 7;
    mob.vel.z += (dz / len) * 7;
    mob.vel.y = 3.2;
    this.game.audio.hit();
    if (mob.health <= 0) {
      this.game.stats.add('hostilesDefeated');
      const drop = Math.random() < MOB.dropChance ? 'sulfur_dust' : 'coal';
      this.game.spawnDrop(drop, 1, mob.pos);
      this.game.notify(`The ${mob.kind === 'crawler' ? 'cave dweller' : 'magmite'} is dead.`, 'good');
      const index = this.mobs.indexOf(mob);
      if (index >= 0) this.remove(index);
    }
  }

  private remove(index: number): void {
    const mob = this.mobs[index];
    this.group.remove(mob.model.group);
    this.mobs.splice(index, 1);
  }

  private trySpawn(): void {
    const world = this.game.world;
    const player = this.game.player;
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 16;
      const x = Math.floor(player.pos.x + Math.cos(angle) * dist);
      const z = Math.floor(player.pos.z + Math.sin(angle) * dist);
      if (x < 2 || z < 2 || x >= WORLD_X - 2 || z >= WORLD_Z - 2) continue;
      for (let y = Math.min(WORLD_Y - 3, Math.floor(player.pos.y + 6)); y > 3; y--) {
        const here = world.getBlock(x, y, z);
        const above = world.getBlock(x, y + 1, z);
        if (here === Block.AIR && above === Block.AIR && world.isSolidAt(x, y - 1, z)) {
          const light = world.lightAt(x, y, z);
          if (light > 6) continue;
          const kind: MobKind = y < 22 && Math.random() < 0.5 ? 'magmite' : 'crawler';
          const model = createMobModel(kind);
          const mob: Mob = {
            kind,
            pos: new THREE.Vector3(x + 0.5, y, z + 0.5),
            vel: new THREE.Vector3(),
            stepState: createStepState(),
            yaw: 0,
            health: MOB.health,
            maxHealth: MOB.health,
            attackCooldown: 0,
            wanderTimer: Math.random() * 3,
            wanderAngle: Math.random() * Math.PI * 2,
            model,
            hurtTimer: 0,
          };
          this.mobs.push(mob);
          this.group.add(model.group);
          return;
        }
      }
    }
  }
}
