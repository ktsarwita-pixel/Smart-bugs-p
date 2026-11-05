import * as THREE from 'three';
import type { World } from '../world/world';

export interface MoveResult {
  grounded: boolean;
  hitWall: boolean;
  landed: boolean;
  /** True while the entity is gliding up a ledge. */
  climbing: boolean;
}

/** Largest distance a single collision step may cover (blocks). */
const MAX_STEP = 0.35;

/** How fast a miner glides up a ledge (blocks per second). */
const CLIMB_SPEED = 7;

/**
 * State for the smooth step-up.
 *
 * Walking into a block used to teleport the miner a whole block upwards,
 * which read as an automatic jump (and the miner then dropped back down, so
 * it looked like a hop). Now the miner glides up the face of the ledge and
 * only carries on walking once they are on top of it. The entity owns this
 * state so the glide can run over several frames.
 */
export interface StepState {
  /** True while the miner is gliding up a ledge. */
  climbing: boolean;
  /** The height the miner is gliding towards. */
  targetY: number;
}

export function createStepState(): StepState {
  return { climbing: false, targetY: 0 };
}

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
 * Height of the ledge the entity would have to climb to keep walking into
 * `x`/`z`, or null when there is no ledge it can get over.
 *
 * Only ledges up to `maxRise` blocks are considered, so a full wall still
 * stops the miner and has to be jumped over.
 */
function findLedge(
  world: World,
  x: number,
  z: number,
  feetY: number,
  half: number,
  height: number,
  maxRise: number,
): number | null {
  if (maxRise <= 0) return null;
  const minX = Math.floor(x - half + 1e-6);
  const maxX = Math.floor(x + half - 1e-6);
  const minZ = Math.floor(z - half + 1e-6);
  const maxZ = Math.floor(z + half - 1e-6);
  const topBlock = Math.floor(feetY + maxRise);

  let ledge = -Infinity;
  for (let bx = minX; bx <= maxX; bx++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      let top = -Infinity;
      for (let by = Math.floor(feetY + 1e-6); by <= topBlock; by++) {
        if (!world.isSolidAt(bx, by, bz)) continue;
        top = by + 1;
        break;
      }
      if (top === -Infinity) continue;
      if (top - feetY > maxRise) return null;
      if (top > ledge) ledge = top;
    }
  }
  if (ledge === -Infinity) return null;
  // The miner has to fit on top of the ledge.
  if (collides(world, x, ledge, z, half, height)) return null;
  return ledge;
}

/**
 * Move an entity with voxel collision, resolving one axis at a time and
 * gliding up small ledges instead of hopping over them.
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
  state?: StepState,
): MoveResult {
  const result: MoveResult = { grounded: false, hitWall: false, landed: false, climbing: false };

  const distance = Math.hypot(vel.x, vel.y, vel.z) * dt;
  const steps = Math.max(1, Math.ceil(distance / MAX_STEP));
  const subDt = dt / steps;

  for (let step = 0; step < steps; step++) {
    moveStep(world, pos, vel, half, height, subDt, stepHeight, result, state);
  }
  result.climbing = state?.climbing ?? false;
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
  state?: StepState,
): void {
  // --- glide up a ledge -------------------------------------------------
  if (state?.climbing) {
    if (vel.y > 0.01) {
      // The miner jumped: abandon the ledge and let them fly.
      state.climbing = false;
    } else {
      const rise = Math.min(state.targetY - pos.y, CLIMB_SPEED * dt);
      pos.y += rise;
      vel.y = 0;
      result.climbing = true;
      if (pos.y >= state.targetY - 1e-4) {
        pos.y = state.targetY;
        state.climbing = false;
        result.grounded = true;
      }
      // Walking waits until the miner is on top of the ledge.
      return;
    }
  }

  const wasGrounded = collides(world, pos.x, pos.y - 0.06, pos.z, half, height);

  // --- X ---
  let dx = vel.x * dt;
  if (dx !== 0) {
    const target = pos.x + dx;
    if (collides(world, target, pos.y, pos.z, half, height)) {
      const ledge = wasGrounded
        ? findLedge(world, target, pos.z, pos.y, half, height, stepHeight)
        : null;
      if (ledge !== null && state) {
        // Glide up the ledge instead of hopping over it.
        state.climbing = true;
        state.targetY = ledge;
        result.climbing = true;
      } else if (ledge !== null) {
        pos.y = ledge;
        pos.x = target;
      } else {
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
      const ledge = wasGrounded
        ? findLedge(world, pos.x, target, pos.y, half, height, stepHeight)
        : null;
      if (ledge !== null && state) {
        state.climbing = true;
        state.targetY = ledge;
        result.climbing = true;
      } else if (ledge !== null) {
        pos.y = ledge;
        pos.z = target;
      } else {
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
