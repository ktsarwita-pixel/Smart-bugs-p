import * as THREE from 'three';
import type { World } from '../world/world';

export interface CharacterParts {
  group: THREE.Group;
  /** Named pivots that can be animated. */
  parts: Record<string, THREE.Object3D>;
  materials: THREE.MeshBasicMaterial[];
  baseColors: THREE.Color[];
  /** Materials that should ignore the ambient light factor. */
  glowMaterials: THREE.MeshBasicMaterial[];
  /** The tool models the miner can hold, keyed by tool kind. */
  tools?: Record<string, THREE.Object3D>;
  /** The coloured pieces of the tools, so they can be re-tinted per material. */
  toolPieces?: ToolPiece[];
}

interface ToolPiece {
  /** Index into materials / baseColors. */
  index: number;
  role: 'base' | 'light' | 'dark';
}

/** A tool piece that can be re-coloured when the miner switches tools. */
function toolPiece(
  parts: CharacterParts,
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  color: number,
  role: 'base' | 'light' | 'dark',
  x = 0,
  y = 0,
  z = 0,
): void {
  const index = parts.materials.length;
  box(parent, parts, w, h, d, color, x, y, z);
  (parts.toolPieces ??= []).push({ index, role });
}

/** The kind of tool the miner is holding. */
export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'drill';

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

/** A box that is added to a parent straight away. */
function box(
  parent: THREE.Object3D,
  parts: CharacterParts,
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  glow = false,
): THREE.Mesh {
  const m = mesh(w, h, d, color, parts, glow);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function pivot(parent: THREE.Object3D, name: string, x: number, y: number, z: number): THREE.Object3D {
  const p = new THREE.Object3D();
  p.position.set(x, y, z);
  p.name = name;
  parent.add(p);
  return p;
}

/* ------------------------------------------------------------------ */
/* Blob shadow                                                         */
/* ------------------------------------------------------------------ */

let shadowTexture: THREE.Texture | null = null;

/** A soft round shadow, painted with plain rectangles so it works anywhere. */
function getShadowTexture(): THREE.Texture {
  if (shadowTexture) return shadowTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rings = 7;
  for (let i = 0; i < rings; i++) {
    const t = i / rings;
    const r = (size / 2) * (1 - t);
    ctx.fillStyle = `rgba(0,0,0,${(0.42 * (1 - t)).toFixed(3)})`;
    ctx.fillRect(size / 2 - r, size / 2 - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  shadowTexture = tex;
  return tex;
}

/** Creates the soft shadow that sits under a character. */
export function createShadow(radius = 0.42): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: getShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 2;
  return shadow;
}

/** Drops the shadow onto the ground under the entity and fades it with height. */
export function updateShadow(
  shadow: THREE.Mesh,
  world: World,
  x: number,
  y: number,
  z: number,
): void {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  let ground = -1;
  const from = Math.floor(y + 0.2);
  for (let by = from; by >= Math.max(0, from - 14); by--) {
    if (world.isSolidAt(bx, by, bz)) {
      ground = by + 1;
      break;
    }
  }
  if (ground < 0) {
    shadow.visible = false;
    return;
  }
  shadow.visible = true;
  const drop = Math.max(0, y - ground);
  const k = Math.max(0.4, 1 - drop * 0.18);
  shadow.scale.set(k, k, 1);
  shadow.position.set(x, ground + 0.02, z);
  (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 0.85 - drop * 0.22);
}

/* ------------------------------------------------------------------ */
/* Held tools                                                          */
/* ------------------------------------------------------------------ */

interface ToolMetal {
  head: number;
  light: number;
  dark: number;
  base: number;
}

const TOOL_COLORS: Record<string, ToolMetal> = {
  wood: { head: 0x9a6a35, light: 0xb5803f, dark: 0x6b421e, base: 0x9a6a35 },
  stone: { head: 0x8f8f8f, light: 0xa8a8a8, dark: 0x636363, base: 0x8f8f8f },
  iron: { head: 0xd8d8dc, light: 0xf4f4f8, dark: 0x9a9aa2, base: 0xd8d8dc },
  steel: { head: 0x9aa3ab, light: 0xc6cfd7, dark: 0x667079, base: 0x9aa3ab },
  diamond: { head: 0x4fe0dc, light: 0xc9fffd, dark: 0x229c9a, base: 0x4fe0dc },
  sulfur: { head: 0xe8d24a, light: 0xfbf3a8, dark: 0xa89420, base: 0xe8d24a },
};

/* ------------------------------------------------------------------ */
/* The player miner                                                    */
/* ------------------------------------------------------------------ */

/**
 * The player miner: yellow hard hat with a lamp, goggles, blue coveralls,
 * a pack on the back and heavy boots.
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
  const skinDark = 0xb8875f;
  const hat = 0xf2c14e;
  const hatDark = 0xc79a35;
  const overall = 0x2f6fa8;
  const overallDark = 0x24558a;
  const shirt = 0xb8523f;
  const boot = 0x3a2a1c;
  const pack = 0x6b4a2c;

  // --- head (pivot at the neck) ---
  const head = pivot(parts.group, 'head', 0, 1.42, 0);
  parts.parts.head = head;
  box(head, parts, 0.5, 0.5, 0.5, skin, 0, 0.25, 0);
  // Face.
  box(head, parts, 0.06, 0.06, 0.03, 0x2b2118, -0.11, 0.27, 0.26);
  box(head, parts, 0.06, 0.06, 0.03, 0x2b2118, 0.11, 0.27, 0.26);
  box(head, parts, 0.16, 0.04, 0.03, skinDark, 0, 0.13, 0.26);
  // Hard hat with a ridge.
  box(head, parts, 0.56, 0.18, 0.56, hat, 0, 0.55, 0);
  box(head, parts, 0.12, 0.06, 0.56, hatDark, 0, 0.66, 0);
  box(head, parts, 0.64, 0.07, 0.64, hat, 0, 0.46, 0);
  box(head, parts, 0.64, 0.03, 0.64, hatDark, 0, 0.43, 0);
  // Helmet lamp.
  box(head, parts, 0.14, 0.12, 0.1, 0x39424b, 0, 0.58, 0.3);
  box(head, parts, 0.1, 0.08, 0.03, 0xfff0b0, 0, 0.58, 0.36, true);
  // Goggles.
  box(head, parts, 0.44, 0.13, 0.06, 0x1b2a33, 0, 0.36, 0.26);
  box(head, parts, 0.15, 0.1, 0.03, 0x8fd8e8, -0.11, 0.36, 0.3);
  box(head, parts, 0.15, 0.1, 0.03, 0x8fd8e8, 0.11, 0.36, 0.3);
  box(head, parts, 0.04, 0.1, 0.03, 0x5a7684, 0, 0.36, 0.3);
  // Chin strap.
  box(head, parts, 0.06, 0.1, 0.04, 0x39424b, -0.24, 0.2, 0);
  box(head, parts, 0.06, 0.1, 0.04, 0x39424b, 0.24, 0.2, 0);

  // --- torso ---
  const body = pivot(parts.group, 'body', 0, 0.78, 0);
  parts.parts.body = body;
  box(body, parts, 0.5, 0.6, 0.28, overall, 0, 0.3, 0);
  // Shirt shoulders.
  box(body, parts, 0.54, 0.16, 0.3, shirt, 0, 0.5, 0);
  // Straps.
  box(body, parts, 0.1, 0.6, 0.3, overallDark, -0.13, 0.32, 0.005);
  box(body, parts, 0.1, 0.6, 0.3, overallDark, 0.13, 0.32, 0.005);
  // Belt and pouch.
  box(body, parts, 0.52, 0.1, 0.3, boot, 0, 0.03, 0);
  box(body, parts, 0.12, 0.14, 0.1, 0x8a6338, 0.2, 0.02, 0.14);
  // Chest lamp.
  box(body, parts, 0.13, 0.13, 0.08, 0x39424b, 0.14, 0.52, 0.16);
  box(body, parts, 0.09, 0.09, 0.03, 0xfff0b0, 0.14, 0.52, 0.21, true);
  // Back pack.
  box(body, parts, 0.4, 0.42, 0.18, pack, 0, 0.34, -0.22);
  box(body, parts, 0.42, 0.08, 0.2, 0x8a6338, 0, 0.48, -0.23);
  box(body, parts, 0.14, 0.1, 0.06, 0xf2c14e, 0, 0.36, -0.33);

  // --- arms (shoulder -> elbow -> hand) ---
  for (const side of [-1, 1] as const) {
    const key = side < 0 ? 'armL' : 'armR';
    const arm = pivot(parts.group, key, side * 0.36, 1.36, 0);
    parts.parts[key] = arm;
    box(arm, parts, 0.2, 0.3, 0.2, shirt, 0, -0.13, 0);
    box(arm, parts, 0.21, 0.06, 0.21, overallDark, 0, -0.26, 0);
    const elbow = pivot(arm, `${key}Elbow`, 0, -0.28, 0);
    parts.parts[`${key}Elbow`] = elbow;
    box(elbow, parts, 0.18, 0.28, 0.18, overall, 0, -0.14, 0);
    box(elbow, parts, 0.19, 0.08, 0.19, 0x39424b, 0, -0.28, 0);
    const hand = pivot(elbow, `${key}Hand`, 0, -0.3, 0);
    parts.parts[`${key}Hand`] = hand;
    box(hand, parts, 0.2, 0.16, 0.2, skin, 0, -0.06, 0);
  }

  // --- legs (hip -> knee -> boot) ---
  for (const side of [-1, 1] as const) {
    const key = side < 0 ? 'legL' : 'legR';
    const leg = pivot(parts.group, key, side * 0.13, 0.74, 0);
    parts.parts[key] = leg;
    box(leg, parts, 0.22, 0.34, 0.22, overall, 0, -0.16, 0);
    const knee = pivot(leg, `${key}Knee`, 0, -0.32, 0);
    parts.parts[`${key}Knee`] = knee;
    box(knee, parts, 0.2, 0.3, 0.2, overallDark, 0, -0.14, 0);
    box(knee, parts, 0.22, 0.08, 0.22, 0x39424b, 0, -0.26, 0);
    box(knee, parts, 0.24, 0.16, 0.3, boot, 0, -0.36, 0.03);
    box(knee, parts, 0.25, 0.04, 0.31, 0x2a1e14, 0, -0.43, 0.03);
  }

  // --- the tool, carried in the right hand ---
  const hand = parts.parts.armRHand ?? parts.group;
  const toolRoot = pivot(hand, 'tool', 0, -0.06, 0.04);
  parts.parts.tool = toolRoot;
  const tools: Record<string, THREE.Object3D> = {};
  tools.pickaxe = buildPickaxe(parts);
  tools.axe = buildAxe(parts);
  tools.shovel = buildShovel(parts);
  tools.sword = buildSword(parts);
  tools.drill = buildDrill(parts);
  for (const tool of Object.values(tools)) {
    tool.visible = false;
    toolRoot.add(tool);
  }
  parts.tools = tools;

  return parts;
}

function buildPickaxe(parts: CharacterParts): THREE.Group {
  const g = new THREE.Group();
  const wood = 0x8a5a2b;
  const woodDark = 0x5f3d1c;
  const iron = TOOL_COLORS.iron;
  box(g, parts, 0.07, 0.62, 0.07, wood, 0, -0.24, 0);
  box(g, parts, 0.08, 0.08, 0.08, woodDark, 0, -0.5, 0);
  toolPiece(parts, g, 0.46, 0.09, 0.09, iron.head, 'base', 0, 0.06, 0);
  toolPiece(parts, g, 0.12, 0.2, 0.09, iron.light, 'light', -0.21, -0.02, 0);
  toolPiece(parts, g, 0.12, 0.2, 0.09, iron.light, 'light', 0.21, -0.02, 0);
  toolPiece(parts, g, 0.2, 0.03, 0.1, iron.light, 'light', 0, 0.11, 0);
  g.rotation.x = -0.35;
  g.position.set(0, -0.04, 0.04);
  return g;
}

function buildAxe(parts: CharacterParts): THREE.Group {
  const g = new THREE.Group();
  const wood = 0x8a5a2b;
  const iron = TOOL_COLORS.iron;
  box(g, parts, 0.07, 0.6, 0.07, wood, 0, -0.24, 0);
  toolPiece(parts, g, 0.16, 0.26, 0.08, iron.head, 'base', 0, 0.06, 0);
  toolPiece(parts, g, 0.05, 0.3, 0.09, iron.light, 'light', -0.08, 0.07, 0);
  toolPiece(parts, g, 0.2, 0.05, 0.09, iron.light, 'light', 0.01, 0.17, 0);
  g.rotation.x = -0.3;
  g.position.set(0, -0.04, 0.04);
  return g;
}

function buildShovel(parts: CharacterParts): THREE.Group {
  const g = new THREE.Group();
  const wood = 0x8a5a2b;
  const iron = TOOL_COLORS.iron;
  box(g, parts, 0.07, 0.58, 0.07, wood, 0, -0.22, 0);
  toolPiece(parts, g, 0.2, 0.24, 0.05, iron.head, 'base', 0, 0.12, 0);
  toolPiece(parts, g, 0.16, 0.04, 0.06, iron.light, 'light', 0, 0.23, 0);
  g.rotation.x = -0.3;
  g.position.set(0, -0.04, 0.04);
  return g;
}

function buildSword(parts: CharacterParts): THREE.Group {
  const g = new THREE.Group();
  const iron = TOOL_COLORS.iron;
  toolPiece(parts, g, 0.06, 0.66, 0.03, iron.head, 'base', 0, 0.24, 0);
  toolPiece(parts, g, 0.02, 0.6, 0.02, iron.light, 'light', -0.02, 0.26, 0);
  box(g, parts, 0.26, 0.06, 0.06, 0x8a6338, 0, -0.1, 0);
  box(g, parts, 0.07, 0.18, 0.07, 0x5f3d1c, 0, -0.2, 0);
  box(g, parts, 0.1, 0.06, 0.1, 0xf2c14e, 0, -0.3, 0);
  g.rotation.x = -0.5;
  g.position.set(0, -0.04, 0.04);
  return g;
}

function buildDrill(parts: CharacterParts): THREE.Group {
  const g = new THREE.Group();
  const steel = TOOL_COLORS.steel;
  const sulfur = TOOL_COLORS.sulfur;
  box(g, parts, 0.16, 0.16, 0.4, steel.head, 0, 0.12, 0.06);
  toolPiece(parts, g, 0.18, 0.05, 0.42, steel.light, 'light', 0, 0.21, 0.06);
  toolPiece(parts, g, 0.1, 0.1, 0.06, sulfur.base, 'base', 0, 0.12, 0.26);
  toolPiece(parts, g, 0.07, 0.07, 0.22, sulfur.light, 'light', 0, 0.12, 0.38);
  box(g, parts, 0.08, 0.26, 0.08, 0x4a525a, 0, -0.1, -0.04);
  g.rotation.x = -0.35;
  g.position.set(0, -0.04, 0.04);
  return g;
}

/** The tools the game knows about, and the material they are made of. */
const TOOL_ITEMS: Record<string, { kind: ToolKind; material: keyof typeof TOOL_COLORS }> = {
  pickaxe_wood: { kind: 'pickaxe', material: 'wood' },
  pickaxe_stone: { kind: 'pickaxe', material: 'stone' },
  pickaxe_iron: { kind: 'pickaxe', material: 'iron' },
  pickaxe_steel: { kind: 'pickaxe', material: 'steel' },
  pickaxe_diamond: { kind: 'pickaxe', material: 'diamond' },
  axe_iron: { kind: 'axe', material: 'iron' },
  axe_steel: { kind: 'axe', material: 'steel' },
  shovel_iron: { kind: 'shovel', material: 'iron' },
  shovel_steel: { kind: 'shovel', material: 'steel' },
  sword_iron: { kind: 'sword', material: 'iron' },
  sword_steel: { kind: 'sword', material: 'steel' },
  drill_sulfur: { kind: 'drill', material: 'sulfur' },
};

/** Shows the tool the miner is holding, in the right material. */
export function setHeldTool(parts: CharacterParts, itemId: string | null): void {
  const tools = parts.tools;
  if (!tools) return;
  const entry = itemId ? TOOL_ITEMS[itemId] : undefined;
  for (const [name, tool] of Object.entries(tools)) tool.visible = entry?.kind === name;
  if (!entry) return;
  const metal = TOOL_COLORS[entry.material];
  for (const piece of parts.toolPieces ?? []) {
    const mat = parts.materials[piece.index];
    const base = parts.baseColors[piece.index];
    if (!mat || !base) continue;
    const color = metal[piece.role];
    base.setHex(color);
    mat.color.setHex(color);
  }
}

/* ------------------------------------------------------------------ */
/* BOLT-7                                                              */
/* ------------------------------------------------------------------ */

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
  const shellLight = 0xbcc6ce;
  const dark = 0x4c5560;
  const accent = 0x7fd1a8;
  const hazard = 0xe8c14a;

  const body = pivot(parts.group, 'body', 0, 0.82, 0);
  parts.parts.body = body;
  box(body, parts, 0.62, 0.52, 0.42, shell, 0, 0.26, 0);
  box(body, parts, 0.64, 0.08, 0.44, shellLight, 0, 0.5, 0);
  box(body, parts, 0.44, 0.3, 0.06, dark, 0, 0.3, 0.22);
  box(body, parts, 0.4, 0.12, 0.05, accent, 0, 0.38, 0.25, true);
  box(body, parts, 0.18, 0.18, 0.06, accent, 0, 0.16, 0.25, true);
  // Hazard stripes along the chest.
  for (let i = 0; i < 3; i++) {
    box(body, parts, 0.06, 0.26, 0.03, hazard, -0.16 + i * 0.16, 0.3, 0.26);
  }
  // Rivets along the shoulders.
  for (const side of [-1, 1] as const) {
    box(body, parts, 0.05, 0.05, 0.05, shellLight, side * 0.28, 0.5, 0.18);
    box(body, parts, 0.05, 0.05, 0.05, shellLight, side * 0.28, 0.5, -0.18);
  }
  // Shoulder lights.
  box(body, parts, 0.08, 0.08, 0.14, accent, -0.32, 0.44, 0, true);
  box(body, parts, 0.08, 0.08, 0.14, accent, 0.32, 0.44, 0, true);

  // Head
  const head = pivot(parts.group, 'head', 0, 1.22, 0);
  parts.parts.head = head;
  box(head, parts, 0.4, 0.34, 0.38, shell, 0, 0.17, 0);
  box(head, parts, 0.42, 0.06, 0.4, shellLight, 0, 0.34, 0);
  box(head, parts, 0.26, 0.1, 0.05, accent, 0, 0.2, 0.2, true);
  box(head, parts, 0.08, 0.14, 0.04, dark, 0, 0.2, 0.21);
  const antenna = box(head, parts, 0.05, 0.34, 0.05, dark, 0.12, 0.48, -0.04);
  const antennaTip = box(head, parts, 0.1, 0.1, 0.1, accent, 0.12, 0.68, -0.04, true);
  parts.parts.antennaTip = antennaTip;
  void antenna;

  // Drill arm (right side)
  const arm = pivot(parts.group, 'armR', 0.38, 1.02, 0);
  parts.parts.armR = arm;
  box(arm, parts, 0.18, 0.46, 0.18, dark, 0, -0.22, 0);
  box(arm, parts, 0.2, 0.08, 0.2, shellLight, 0, -0.42, 0);
  box(arm, parts, 0.24, 0.24, 0.4, shell, 0, -0.5, 0.12);
  const drill = pivot(arm, 'drill', 0, -0.5, 0.42);
  parts.parts.drill = drill;
  box(drill, parts, 0.12, 0.12, 0.34, 0xc9a227, 0, 0, 0);
  box(drill, parts, 0.06, 0.06, 0.3, 0xe8d24a, 0, 0, 0.02, true);

  // Left arm
  const armL = pivot(parts.group, 'armL', -0.38, 1.02, 0);
  parts.parts.armL = armL;
  box(armL, parts, 0.18, 0.46, 0.18, dark, 0, -0.22, 0);
  box(armL, parts, 0.2, 0.08, 0.2, shellLight, 0, -0.42, 0);
  box(armL, parts, 0.22, 0.22, 0.22, shell, 0, -0.52, 0.05);
  box(armL, parts, 0.1, 0.1, 0.14, accent, 0, -0.58, 0.12, true);

  // Treads
  for (const side of [-1, 1] as const) {
    const key = side < 0 ? 'legL' : 'legR';
    const leg = pivot(parts.group, key, side * 0.19, 0.46, 0);
    parts.parts[key] = leg;
    box(leg, parts, 0.26, 0.32, 0.5, dark, 0, -0.16, 0);
    box(leg, parts, 0.28, 0.08, 0.52, shell, 0, -0.02, 0);
    const wheels = pivot(leg, `${key}Wheels`, 0, -0.16, 0);
    parts.parts[`${key}Wheels`] = wheels;
    box(wheels, parts, 0.3, 0.3, 0.1, 0x39424b, 0, 0, 0.24);
    box(wheels, parts, 0.3, 0.3, 0.1, 0x39424b, 0, 0, -0.24);
    box(wheels, parts, 0.32, 0.08, 0.08, 0x8b949c, 0, 0, 0.24);
    box(wheels, parts, 0.32, 0.08, 0.08, 0x8b949c, 0, 0, -0.24);
    // Tread links.
    for (let i = 0; i < 4; i++) {
      box(wheels, parts, 0.28, 0.06, 0.08, 0x2b3238, 0, -0.12 + i * 0.08, 0.28);
    }
  }

  // Back pack / battery
  box(body, parts, 0.34, 0.3, 0.16, 0x3f6f57, 0, 0.3, -0.28);
  box(body, parts, 0.36, 0.06, 0.18, 0x2f5945, 0, 0.44, -0.28);
  const chargeLed = box(body, parts, 0.16, 0.08, 0.05, accent, 0, 0.3, -0.37, true);
  parts.parts.chargeLed = chargeLed;

  return parts;
}

/* ------------------------------------------------------------------ */
/* Light and animation                                                 */
/* ------------------------------------------------------------------ */

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
  const amount = Math.min(1, speed / 4.6);
  const swing = Math.sin(phase) * 0.95 * amount;
  const legL = parts.parts.legL;
  const legR = parts.parts.legR;
  const armL = parts.parts.armL;
  const armR = parts.parts.armR;
  if (legL) {
    legL.rotation.x = swing;
    const knee = parts.parts.legLKnee;
    if (knee) knee.rotation.x = Math.max(0, -swing) * 0.9;
  }
  if (legR) {
    legR.rotation.x = -swing;
    const knee = parts.parts.legRKnee;
    if (knee) knee.rotation.x = Math.max(0, swing) * 0.9;
  }
  if (armL) {
    armL.rotation.x = -swing * 0.8;
    const elbow = parts.parts.armLElbow;
    if (elbow) elbow.rotation.x = -0.25 - Math.max(0, -swing) * 0.5;
  }
  if (armR) {
    armR.rotation.x = swing * 0.8;
    const elbow = parts.parts.armRElbow;
    if (elbow) elbow.rotation.x = -0.25 - Math.max(0, swing) * 0.5;
  }
  const body = parts.parts.body;
  if (body) {
    // A small bob and a lean into the walk.
    body.position.y = 0.78 + Math.abs(Math.sin(phase)) * 0.035 * amount;
    body.rotation.z = Math.sin(phase) * 0.035 * amount;
    body.rotation.x = amount * 0.07;
  }
  const head = parts.parts.head;
  if (head) head.rotation.z = -Math.sin(phase) * 0.03 * amount;
}

/** Idle: a slow breath so the miner is never completely still. */
export function animateIdle(parts: CharacterParts, time: number): void {
  const breath = Math.sin(time * 1.6) * 0.012;
  const body = parts.parts.body;
  if (body) body.position.y = 0.78 + breath;
  const head = parts.parts.head;
  if (head) head.rotation.x = Math.sin(time * 1.1) * 0.02;
}

/** Swinging a pickaxe: the arm, the elbow and a twist of the body. */
export function animateSwing(parts: CharacterParts, t: number): void {
  const armR = parts.parts.armR;
  if (!armR) return;
  const p = Math.min(1, Math.max(0, t));
  const arc = Math.sin(p * Math.PI);
  armR.rotation.x = -0.4 + arc * -2.1;
  armR.rotation.z = arc * 0.4;
  const elbow = parts.parts.armRElbow;
  if (elbow) elbow.rotation.x = -0.3 - arc * 0.5;
  const body = parts.parts.body;
  if (body) {
    body.rotation.y = -arc * 0.32;
    body.rotation.x = 0.12 + arc * 0.22;
  }
  const head = parts.parts.head;
  if (head) head.rotation.x = 0.1 + arc * 0.18;
}

/** Squashes the miner briefly when they land hard. */
export function animateLand(parts: CharacterParts, amount: number): void {
  const a = Math.min(1, Math.max(0, amount));
  const body = parts.parts.body;
  if (body) {
    body.scale.set(1 + a * 0.1, 1 - a * 0.16, 1 + a * 0.1);
  }
  const head = parts.parts.head;
  if (head) head.position.y = 1.42 - a * 0.1;
}

/** Releases the squash again. */
export function animateLandRelease(parts: CharacterParts): void {
  const body = parts.parts.body;
  if (body) body.scale.set(1, 1, 1);
  const head = parts.parts.head;
  if (head) head.position.y = 1.42;
}

/** Robot idle / walk / drill animations. */
export function animateRobot(
  parts: CharacterParts,
  phase: number,
  speed: number,
  mining: number,
  time: number,
): void {
  const walk = Math.min(1, speed / 4.4);
  const swing = Math.sin(phase) * 0.7 * walk;
  const legL = parts.parts.legL;
  const legR = parts.parts.legR;
  if (legL) legL.rotation.x = swing;
  if (legR) legR.rotation.x = -swing;
  // The wheels spin with the tracks.
  const wheelsL = parts.parts.legLWheels;
  const wheelsR = parts.parts.legRWheels;
  if (wheelsL) wheelsL.rotation.x = phase * 1.6;
  if (wheelsR) wheelsR.rotation.x = -phase * 1.6;

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
  const drill = parts.parts.drill;
  if (drill) {
    drill.rotation.z = mining > 0 ? time * 26 : time * 0.8;
  }
  const antennaTip = parts.parts.antennaTip;
  if (antennaTip) {
    const s = 1 + Math.sin(time * 4) * 0.16;
    antennaTip.scale.set(s, s, s);
  }
  const body = parts.parts.body;
  if (body) {
    // The robot hovers: a slow float that grows when it works.
    body.position.y = 0.82 + Math.sin(time * 2.2) * 0.03 + mining * 0.02;
    body.rotation.z = Math.sin(time * 1.4) * 0.02;
  }
  const head = parts.parts.head;
  if (head) head.rotation.y = Math.sin(time * 0.7) * 0.12;
}
