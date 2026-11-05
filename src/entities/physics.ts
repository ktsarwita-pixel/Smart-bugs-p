import * as THREE from 'three';
import type { World } from '../world/world';

export interface MoveResult {
  grounded: boolean;
  hitWall: boolean;
  landed: boolean;
}

/** Largest distance a single collision step may cover (blocks). */
const MAX_STEP = 0.35;

/** True when the AABB overlaps any solid voxel. */
export function collides(
  world: World,
  x: number,
  y: number,
  z: number,
  half: number,
  height: number,
): boolean {
  const minX = Math.floor(x - half + 1e-6);
  const maxX = Math.floor(x + half - 1e-6);
  const minY = Math.floor(y + 1e-6);
  const maxY = Math.floor(y + height - 1e-6);
  const minZ = Math.floor(z - half + 1e-6);
  const maxZ = Math.floor(z + half - 1e-6);
  for (let by = minY; by <= maxY; by++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if (world.isSolidAt(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

/**
 * Move an entity with voxel collision, resolving one axis at a time and
 * stepping up small ledges automatically.
 *
 * Movement is split into sub-steps of at most {@link MAX_STEP} blocks so a
 * fast fall (terminal velocity is 46 blocks/s) can never tunnel through a
 * one-block-thick floor.
 */
export function moveEntity(
  world: World,
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  half: number,
  height: number,
  dt: number,
  stepHeight: number,
): MoveResult {
  const result: MoveResult = { grounded: false, hitWall: false, landed: false };

  const distance = Math.hypot(vel.x, vel.y, vel.z) * dt;
  const steps = Math.max(1, Math.ceil(distance / MAX_STEP));
  const subDt = dt / steps;

  for (let step = 0; step < steps; step++) {
    moveStep(world, pos, vel, half, height, subDt, stepHeight, result);
  }
  return result;
}

/** One collision-resolving sub-step. */
function moveStep(
  world: World,
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  half: number,
  height: number,
  dt: number,
  stepHeight: number,
  result: MoveResult,
): void {
  const wasGrounded = collides(world, pos.x, pos.y - 0.06, pos.z, half, height);

  // --- X ---
  let dx = vel.x * dt;
  if (dx !== 0) {
    const target = pos.x + dx;
    if (collides(world, target, pos.y, pos.z, half, height)) {
      let stepped = false;
      if ((wasGrounded || vel.y <= 0) && stepHeight > 0) {
        for (const lift of [stepHeight, stepHeight * 0.5]) {
          if (!collides(world, target, pos.y + lift, pos.z, half, height)) {
            pos.y += lift;
            pos.x = target;
            stepped = true;
            break;
          }
        }
      }
      if (!stepped) {
        // Snap back to just outside the block that stopped us. This has to be
        // worked out from the blocked target, not from where the entity
        // started: using the old position threw the miner a whole block back
        // every time they touched a wall, which looked like a glitch.
        pos.x = vel.x > 0 ? Math.floor(target + half) - half - 1e-4 : Math.floor(target - half) + 1 + half + 1e-4;
        vel.x = 0;
        result.hitWall = true;
      }
    } else {
      pos.x = target;
    }
  }

  // --- Z ---
  let dz = vel.z * dt;
  if (dz !== 0) {
    const target = pos.z + dz;
    if (collides(world, pos.x, pos.y, target, half, height)) {
      let stepped = false;
      if ((wasGrounded || vel.y <= 0) && stepHeight > 0) {
        for (const lift of [stepHeight, stepHeight * 0.5]) {
          if (!collides(world, pos.x, pos.y + lift, target, half, height)) {
            pos.y += lift;
            pos.z = target;
            stepped = true;
            break;
          }
        }
      }
      if (!stepped) {
        pos.z = vel.z > 0 ? Math.floor(target + half) - half - 1e-4 : Math.floor(target - half) + 1 + half + 1e-4;
        vel.z = 0;
        result.hitWall = true;
      }
    } else {
      pos.z = target;
    }
  }

  // --- Y ---
  const dy = vel.y * dt;
  pos.y += dy;
  if (collides(world, pos.x, pos.y, pos.z, half, height)) {
    if (dy <= 0) {
      // Land on top of the block that was hit, not inside it.
      pos.y = Math.floor(pos.y) + 1 + 1e-4;
      result.grounded = true;
      if (dy < -0.08) result.landed = true;
      vel.y = 0;
    } else {
      pos.y = Math.floor(pos.y + height) - height - 1e-4;
      vel.y = 0;
    }
  } else if (dy < 0) {
    // Ground check when slightly above the floor.
    if (collides(world, pos.x, pos.y - 0.08, pos.z, half, height)) {
      result.grounded = true;
    }
  }
}

/** Push an entity out of any block it is stuck inside (e.g. after a world edit). */
export function unstick(world: World, pos: THREE.Vector3, half: number, height: number): void {
  if (!collides(world, pos.x, pos.y, pos.z, half, height)) return;
  for (let i = 0; i < 24; i++) {
    pos.y += 0.25;
    if (!collides(world, pos.x, pos.y, pos.z, half, height)) return;
  }
}
