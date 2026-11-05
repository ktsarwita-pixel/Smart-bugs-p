import * as THREE from 'three';

export interface CharacterParts {
  group: THREE.Group;
  /** Named pivots that can be animated. */
  parts: Record<string, THREE.Object3D>;
  materials: THREE.MeshBasicMaterial[];
  baseColors: THREE.Color[];
  /** Materials that should ignore the ambient light factor. */
  glowMaterials: THREE.MeshBasicMaterial[];
}

function mesh(
  w: number,
  h: number,
  d: number,
  color: number,
  parts: CharacterParts,
  glow = false,
): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ color });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  parts.materials.push(mat);
  parts.baseColors.push(new THREE.Color(color));
  if (glow) parts.glowMaterials.push(mat);
  return m;
}

function pivot(parent: THREE.Object3D, name: string, x: number, y: number, z: number): THREE.Object3D {
  const p = new THREE.Object3D();
  p.position.set(x, y, z);
  p.name = name;
  parent.add(p);
  return p;
}

/**
 * The player miner: yellow hard hat, goggles, blue coveralls, boots.
 * Built from boxes so it matches the blocky voxel look.
 */
export function createMinerModel(): CharacterParts {
  const parts: CharacterParts = {
    group: new THREE.Group(),
    parts: {},
    materials: [],
    baseColors: [],
    glowMaterials: [],
  };

  const skin = 0xd7a17a;
  const hat = 0xf2c14e;
  const overall = 0x2f6fa8;
  const shirt = 0xb8523f;
  const boot = 0x3a2a1c;

  // Head group (pivot at the neck).
  const head = pivot(parts.group, 'head', 0, 1.42, 0);
  parts.parts.head = head;
  const headBox = mesh(0.52, 0.52, 0.52, skin, parts);
  headBox.position.set(0, 0.26, 0);
  head.add(headBox);
  // Hard hat
  const hatBox = mesh(0.58, 0.2, 0.58, hat, parts);
  hatBox.position.set(0, 0.56, 0);
  head.add(hatBox);
  const brim = mesh(0.66, 0.08, 0.66, hat, parts);
  brim.position.set(0, 0.47, 0);
  head.add(brim);
  // Goggles
  const goggles = mesh(0.42, 0.12, 0.06, 0x1b2a33, parts);
  goggles.position.set(0, 0.3, 0.27);
  head.add(goggles);
  const lens = mesh(0.16, 0.1, 0.04, 0x8fd8e8, parts);
  lens.position.set(-0.11, 0.3, 0.3);
  head.add(lens);
  const lens2 = mesh(0.16, 0.1, 0.04, 0x8fd8e8, parts);
  lens2.position.set(0.11, 0.3, 0.3);
  head.add(lens2);

  // Body
  const body = pivot(parts.group, 'body', 0, 0.78, 0);
  parts.parts.body = body;
  const torso = mesh(0.5, 0.62, 0.28, overall, parts);
  torso.position.set(0, 0.3, 0);
  body.add(torso);
  const chest = mesh(0.54, 0.18, 0.3, shirt, parts);
  chest.position.set(0, 0.46, 0);
  body.add(chest);
  const belt = mesh(0.52, 0.1, 0.3, 0x3a2a1c, parts);
  belt.position.set(0, 0.02, 0);
  body.add(belt);
  const lamp = mesh(0.12, 0.12, 0.08, 0xfff0b0, parts, true);
  lamp.position.set(0.14, 0.5, 0.16);
  body.add(lamp);

  // Arms
  for (const side of [-1, 1] as const) {
    const arm = pivot(parts.group, side < 0 ? 'armL' : 'armR', side * 0.37, 1.4, 0);
    parts.parts[side < 0 ? 'armL' : 'armR'] = arm;
    const upper = mesh(0.2, 0.56, 0.2, overall, parts);
    upper.position.set(0, -0.26, 0);
    arm.add(upper);
    const hand = mesh(0.22, 0.18, 0.22, skin, parts);
    hand.position.set(0, -0.62, 0);
    arm.add(hand);
  }

  // Legs
  for (const side of [-1, 1] as const) {
    const leg = pivot(parts.group, side < 0 ? 'legL' : 'legR', side * 0.13, 0.72, 0);
    parts.parts[side < 0 ? 'legL' : 'legR'] = leg;
    const thigh = mesh(0.21, 0.62, 0.21, overall, parts);
    thigh.position.set(0, -0.3, 0);
    leg.add(thigh);
    const bootBox = mesh(0.24, 0.16, 0.3, boot, parts);
    bootBox.position.set(0, -0.66, 0.03);
    leg.add(bootBox);
  }

  return parts;
}

/**
 * BOLT-7, the robot miner: treads, a glowing visor, articulated drill arm
 * and a charge indicator on its back.
 */
export function createRobotModel(): CharacterParts {
  const parts: CharacterParts = {
    group: new THREE.Group(),
    parts: {},
    materials: [],
    baseColors: [],
    glowMaterials: [],
  };

  const shell = 0x9aa5ae;
  const dark = 0x4c5560;
  const accent = 0x7fd1a8;

  const body = pivot(parts.group, 'body', 0, 0.82, 0);
  parts.parts.body = body;
  const chassis = mesh(0.62, 0.52, 0.42, shell, parts);
  chassis.position.set(0, 0.26, 0);
  body.add(chassis);
  const panel = mesh(0.44, 0.3, 0.06, dark, parts);
  panel.position.set(0, 0.3, 0.22);
  body.add(panel);
  const visor = mesh(0.4, 0.12, 0.05, accent, parts, true);
  visor.position.set(0, 0.38, 0.25);
  body.add(visor);
  const chest = mesh(0.18, 0.18, 0.06, accent, parts, true);
  chest.position.set(0, 0.16, 0.25);
  body.add(chest);

  // Head
  const head = pivot(parts.group, 'head', 0, 1.22, 0);
  parts.parts.head = head;
  const skull = mesh(0.4, 0.34, 0.38, shell, parts);
  skull.position.set(0, 0.17, 0);
  head.add(skull);
  const eye = mesh(0.26, 0.1, 0.05, accent, parts, true);
  eye.position.set(0, 0.2, 0.2);
  head.add(eye);
  const antenna = mesh(0.05, 0.34, 0.05, dark, parts);
  antenna.position.set(0.12, 0.48, -0.04);
  head.add(antenna);
  const antennaTip = mesh(0.1, 0.1, 0.1, accent, parts, true);
  antennaTip.position.set(0.12, 0.68, -0.04);
  head.add(antennaTip);
  parts.parts.antennaTip = antennaTip;

  // Drill arm (right side)
  const arm = pivot(parts.group, 'armR', 0.38, 1.02, 0);
  parts.parts.armR = arm;
  const upper = mesh(0.18, 0.46, 0.18, dark, parts);
  upper.position.set(0, -0.22, 0);
  arm.add(upper);
  const drillHousing = mesh(0.24, 0.24, 0.4, shell, parts);
  drillHousing.position.set(0, -0.5, 0.12);
  arm.add(drillHousing);
  const drill = mesh(0.12, 0.12, 0.34, 0xc9a227, parts);
  drill.position.set(0, -0.5, 0.42);
  arm.add(drillHousing);
  arm.add(drill);
  parts.parts.drill = drill;

  // Left arm
  const armL = pivot(parts.group, 'armL', -0.38, 1.02, 0);
  parts.parts.armL = armL;
  const upperL = mesh(0.18, 0.46, 0.18, dark, parts);
  upperL.position.set(0, -0.22, 0);
  armL.add(upperL);
  const claw = mesh(0.22, 0.22, 0.22, shell, parts);
  claw.position.set(0, -0.52, 0.05);
  armL.add(claw);

  // Treads
  for (const side of [-1, 1] as const) {
    const leg = pivot(parts.group, side < 0 ? 'legL' : 'legR', side * 0.19, 0.46, 0);
    parts.parts[side < 0 ? 'legL' : 'legR'] = leg;
    const tread = mesh(0.26, 0.32, 0.5, dark, parts);
    tread.position.set(0, -0.16, 0);
    leg.add(tread);
    const wheel = mesh(0.28, 0.28, 0.1, 0x39424b, parts);
    wheel.position.set(0, -0.16, 0.24);
    leg.add(wheel);
    const wheel2 = mesh(0.28, 0.28, 0.1, 0x39424b, parts);
    wheel2.position.set(0, -0.16, -0.24);
    leg.add(wheel2);
  }

  // Back pack / battery
  const pack = mesh(0.34, 0.3, 0.16, 0x3f6f57, parts);
  pack.position.set(0, 0.3, -0.28);
  body.add(pack);
  const chargeLed = mesh(0.16, 0.08, 0.05, accent, parts, true);
  chargeLed.position.set(0, 0.3, -0.37);
  body.add(chargeLed);
  parts.parts.chargeLed = chargeLed;

  return parts;
}

/** Scale the model colours by the ambient light level of the area. */
export function applyLight(parts: CharacterParts, factor: number): void {
  for (let i = 0; i < parts.materials.length; i++) {
    const mat = parts.materials[i];
    if (parts.glowMaterials.includes(mat)) continue;
    const base = parts.baseColors[i];
    mat.color.setRGB(base.r * factor, base.g * factor, base.b * factor);
  }
}

/** Walking animation for the miner. */
export function animateWalk(parts: CharacterParts, phase: number, speed: number): void {
  const swing = Math.sin(phase) * 0.9 * Math.min(1, speed / 4);
  const legL = parts.parts.legL;
  const legR = parts.parts.legR;
  const armL = parts.parts.armL;
  const armR = parts.parts.armR;
  if (legL) legL.rotation.x = swing;
  if (legR) legR.rotation.x = -swing;
  if (armL) armL.rotation.x = -swing * 0.8;
  if (armR) armR.rotation.x = swing * 0.8;
  if (parts.parts.body) parts.parts.body.position.y = 0.78 + Math.abs(Math.sin(phase)) * 0.03 * Math.min(1, speed / 4);
}

/** Swinging a pickaxe. */
export function animateSwing(parts: CharacterParts, t: number): void {
  const armR = parts.parts.armR;
  if (!armR) return;
  const p = Math.min(1, Math.max(0, t));
  armR.rotation.x = -0.4 + Math.sin(p * Math.PI) * -2.1;
  armR.rotation.z = Math.sin(p * Math.PI) * 0.4;
}

/** Robot idle / walk / drill animations. */
export function animateRobot(
  parts: CharacterParts,
  phase: number,
  speed: number,
  mining: number,
  time: number,
): void {
  const walk = Math.min(1, speed / 4);
  const swing = Math.sin(phase) * 0.7 * walk;
  const legL = parts.parts.legL;
  const legR = parts.parts.legR;
  if (legL) legL.rotation.x = swing;
  if (legR) legR.rotation.x = -swing;
  const armL = parts.parts.armL;
  if (armL) armL.rotation.x = -swing * 0.5;
  const armR = parts.parts.armR;
  if (armR) {
    if (mining > 0) {
      armR.rotation.x = -1.15 + Math.sin(time * 18) * 0.18 * mining;
      armR.rotation.z = 0.1;
    } else {
      armR.rotation.x = swing * 0.4;
      armR.rotation.z = 0;
    }
  }
  if (parts.parts.drill) {
    parts.parts.drill.rotation.z = mining > 0 ? time * 26 : 0;
  }
  if (parts.parts.antennaTip) {
    const s = 1 + Math.sin(time * 4) * 0.16;
    parts.parts.antennaTip.scale.set(s, s, s);
  }
}
