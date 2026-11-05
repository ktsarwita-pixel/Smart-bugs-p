/**
 * Global tunables for Sulfur Miners v2.
 * Every magic number that gameplay depends on lives here so balance passes
 * touch a single file.
 */

export const CHUNK_SIZE = 16;
export const WORLD_X = 128;
export const WORLD_Z = 128;
export const WORLD_Y = 96;
export const CHUNKS_X = WORLD_X / CHUNK_SIZE;
export const CHUNKS_Z = WORLD_Z / CHUNK_SIZE;

export const SEA_LEVEL = 31;
export const BEDROCK_TOP = 3;

/** Player physics (metres + seconds). */
export const PLAYER = {
  width: 0.6,
  height: 1.8,
  eyeHeight: 1.62,
  crouchEyeHeight: 1.35,
  crouchHeight: 1.45,
  walkSpeed: 4.6,
  sprintSpeed: 7.1,
  crouchSpeed: 2.1,
  swimSpeed: 3.0,
  jumpVelocity: 8.4,
  gravity: 26,
  terminalVelocity: 46,
  stepHeight: 1.05,
  reach: 5.2,
  maxHealth: 20,
  maxStamina: 100,
  staminaDrain: 14,
  staminaRegen: 22,
  fallSafeHeight: 3.2,
  invulnerability: 0.55,
};

/** Robot miner (BOLT-7) tuning. */
export const ROBOT = {
  width: 0.7,
  height: 1.9,
  speed: 4.4,
  followDistance: 3.4,
  farDistance: 12,
  miningRange: 3.2,
  miningTime: 1.25,
  batteryMax: 100,
  batteryDrainMining: 7.5,
  batteryDrainIdle: 0.55,
  batteryDrainFollow: 1.5,
  batteryRecharge: 9.5,
  cargoSlots: 8,
  sightRadius: 7.5,
  scanRadius: 22,
};

/** Mobs. */
export const MOB = {
  spawnInterval: 14,
  maxMobs: 12,
  despawnDistance: 34,
  attackDamage: 3,
  attackCooldown: 1.1,
  speed: 2.6,
  detectRange: 16,
  health: 12,
  dropChance: 0.55,
} as const;

/** Economy: value of one unit when sold at the market. */
export const START_CREDITS = 60;

/** Fog / render tuning. */
export const RENDER = {
  fogNear: 18,
  fogFar: 78,
  defaultRenderDistance: 6,
  maxRenderDistance: 12,
  maxPixelRatio: 2,
  mobilePixelRatio: 1.5,
  skyRadius: 900,
} as const;

/** Day/night cycle length in seconds. */
export const DAY_LENGTH = 600;

export const GAME_TITLE = 'Sulfur Miners v2';
export const SUBTITLE = 'Deep Shaft Edition';
export const SAVE_KEY = 'sulfur-miners-v2/save/v1';
export const SETTINGS_KEY = 'sulfur-miners-v2/settings/v1';
