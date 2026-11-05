import * as THREE from 'three';
import { itemIconTexture } from '../render/textures';
import { moveEntity } from './physics';
import type { Game } from '../game/game';

export interface ItemEntity {
  id: string;
  count: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  sprite: THREE.Sprite;
  picked: boolean;
}

/**
 * Dropped items. They bob, spin, and are pulled towards the player once they
 * get close enough (magnet pickup) — just like a certain blocky game.
 */
export class ItemManager {
  readonly entities: ItemEntity[] = [];
  private group = new THREE.Group();

  constructor(private readonly game: Game) {
    this.group.name = 'item-entities';
  }

  attach(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  spawn(id: string, count: number, pos: THREE.Vector3, velocity?: THREE.Vector3): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: itemIconTexture(id), transparent: true }),
    );
    sprite.scale.set(0.42, 0.42, 0.42);
    sprite.position.copy(pos);
    this.group.add(sprite);
    this.entities.push({
      id,
      count,
      pos: pos.clone(),
      vel: velocity ? velocity.clone() : new THREE.Vector3((Math.random() - 0.5) * 1.6, 2.2, (Math.random() - 0.5) * 1.6),
      age: 0,
      sprite,
      picked: false,
    });
  }

  update(dt: number): void {
    const player = this.game.player;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      e.age += dt;

      // Magnet pull.
      const dx = player.pos.x - e.pos.x;
      const dy = player.pos.y + 0.8 - e.pos.y;
      const dz = player.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 2.6 && e.age > 0.35) {
        const pull = 12 * (1 - dist / 2.6);
        e.vel.x += (dx / (dist || 1)) * pull * dt;
        e.vel.y += (dy / (dist || 1)) * pull * dt;
        e.vel.z += (dz / (dist || 1)) * pull * dt;
      }

      e.vel.y -= 22 * dt;
      e.vel.multiplyScalar(0.94);
      moveEntity(this.game.world, e.pos, e.vel, 0.15, 0.3, dt, 0.6);
      if (e.pos.y < 0.5) {
        e.pos.y = 0.5;
        e.vel.y = 0;
        e.vel.x *= 0.7;
        e.vel.z *= 0.7;
      }

      e.sprite.position.set(e.pos.x, e.pos.y + 0.25 + Math.sin(e.age * 2.4) * 0.07, e.pos.z);
      e.sprite.material.rotation = e.age * 1.6;

      if (dist < 0.85) {
        const left = this.game.inventory.add(e.id, e.count);
        if (left < e.count) {
          this.game.audio.pickup();
          this.game.notify(`+${e.count - left} ${e.id.replace(/_/g, ' ')}`, 'good');
          this.game.stats.recordMined(e.id);
        }
        e.count = left;
        if (e.count <= 0) {
          this.group.remove(e.sprite);
          (e.sprite.material as THREE.SpriteMaterial).dispose();
          this.entities.splice(i, 1);
        }
      } else if (e.age > 300) {
        this.group.remove(e.sprite);
        (e.sprite.material as THREE.SpriteMaterial).dispose();
        this.entities.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const e of this.entities) {
      this.group.remove(e.sprite);
      (e.sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.entities.length = 0;
  }
}
