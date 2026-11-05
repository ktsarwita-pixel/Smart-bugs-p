import * as THREE from 'three';
import {
  DAY_LENGTH,
  GAME_TITLE,
  PLAYER,
  RENDER,
  SAVE_KEY,
  SETTINGS_KEY,
  START_CREDITS,
  WORLD_X,
  WORLD_Z,
} from '../core/constants';
import { AudioEngine } from '../core/audio';
import { Input } from '../core/input';
import { Block, blockDef } from '../world/blocks';
import { World } from '../world/world';
import { Player } from '../entities/player';
import { Robot } from '../entities/robot';
import { MobManager } from '../entities/mobs';
import { ItemManager } from '../entities/items';
import { createAtlasTexture } from '../render/textures';
import { createSkyMaterial, createVoxelMaterials, type SkyMaterial } from '../render/materials';
import { ParticleSystem } from '../render/particles';
import { HUD } from '../ui/hud';
import { Screens } from '../ui/screens';
import { Minimap } from '../ui/minimap';
import { TouchControls } from '../ui/touch';
import { Inventory, type ItemStack } from './inventory';
import { itemDef, type ItemDef } from './items';
import { allRecipes, type Recipe } from './recipes';
import { QUESTS, Stats, type QuestDef } from './quests';
import { upgradeById } from './upgrades';

export interface Settings {
  sensitivity: number;
  fov: number;
  volume: number;
  renderDistance: number;
  invertY: boolean;
  touchControls: boolean;
  showFps: boolean;
  ambience: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  fov: 78,
  volume: 0.65,
  renderDistance: RENDER.defaultRenderDistance,
  invertY: false,
  touchControls: false,
  showFps: true,
  ambience: true,
};

interface SaveData {
  version: number;
  seed: number;
  time: number;
  credits: number;
  player: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    health: number;
    maxHealth: number;
  };
  inventory: unknown;
  upgrades: string[];
  quests: string[];
  stats: unknown;
  edits: Array<[number, number]>;
  robot: unknown;
}

export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  /** False when the browser cannot give us a WebGL context. */
  graphicsAvailable = true;
  readonly audio = new AudioEngine();
  readonly input: Input;

  world!: World;
  player!: Player;
  robot!: Robot;
  mobs!: MobManager;
  items!: ItemManager;
  particles!: ParticleSystem;
  hud!: HUD;
  screens!: Screens;
  minimap = new Minimap();
  touch!: TouchControls;

  inventory = new Inventory(36);
  stats = new Stats();
  settings: Settings = { ...DEFAULT_SETTINGS };
  credits = START_CREDITS;
  upgrades = new Set<string>();
  completedQuests = new Set<string>();
  seed = 0;
  /** Time of day in [0,1). */
  time = 0.28;
  /** Seconds since the game started (used for shaders). */
  elapsed = 0;
  nearSmelter = false;
  activeQuest: QuestDef | null = null;

  private skyMaterial!: SkyMaterial;
  private materials!: ReturnType<typeof createVoxelMaterials>;
  private lastFrame = 0;
  private fps = 60;
  private frames = 0;
  private fpsTimer = 0;
  private saveTimer = 0;
  private paused = false;
  private pausedOverlay: HTMLDivElement;
  private loadingFill: HTMLElement;
  private loadingStatus: HTMLElement;
  private ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
  private pointLight: THREE.PointLight;
  private autoSaveEnabled = true;

  constructor(container: HTMLElement) {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        powerPreference: 'high-performance',
        alpha: false,
      });
      this.renderer.setPixelRatio(this.pixelRatio());
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.setClearColor(0x0b0d12, 1);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } catch (error) {
      // No WebGL (headless test run, blocked GPU, ancient browser): keep the
      // simulation running so the game logic stays testable and usable.
      console.warn('WebGL unavailable — running without rendering.', error);
      this.graphicsAvailable = false;
      this.renderer = {
        setPixelRatio: () => undefined,
        setSize: () => undefined,
        setClearColor: () => undefined,
        render: () => undefined,
        dispose: () => undefined,
        domElement: this.canvas,
      } as unknown as THREE.WebGLRenderer;
    }

    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov,
      window.innerWidth / window.innerHeight,
      0.08,
      600,
    );
    this.scene.add(this.ambientLight);
    this.pointLight = new THREE.PointLight(0xffd9a0, 0, 16, 1.6);
    this.scene.add(this.pointLight);

    this.input = new Input(this.canvas);

    // Loading UI
    this.loadingFill = document.getElementById('loading-fill') as HTMLElement;
    this.loadingStatus = document.getElementById('loading-status') as HTMLElement;

    // Pause overlay
    this.pausedOverlay = document.createElement('div');
    this.pausedOverlay.className = 'menu-backdrop hidden';
    this.pausedOverlay.innerHTML = `
      <div class="menu-card">
        <h2>Paused</h2>
        <p>The shaft can wait a moment.</p>
        <div class="menu-actions">
          <button class="btn primary" data-resume>Resume</button>
          <button class="btn" data-pack>Open pack</button>
          <button class="btn" data-craft>Crafting bench</button>
          <button class="btn" data-save>Save now</button>
          <button class="btn" data-help>Field manual</button>
          <button class="btn danger" data-quit>New world</button>
        </div>
      </div>
    `;
    container.appendChild(this.pausedOverlay);
    this.pausedOverlay.querySelector('[data-resume]')?.addEventListener('click', () => this.togglePause());
    this.pausedOverlay.querySelector('[data-pack]')?.addEventListener('click', () => {
      this.togglePause();
      this.screens.open('inventory');
    });
    this.pausedOverlay.querySelector('[data-craft]')?.addEventListener('click', () => {
      this.togglePause();
      this.screens.open('crafting');
    });
    this.pausedOverlay.querySelector('[data-save]')?.addEventListener('click', () => {
      this.saveGame();
      this.notify('Progress saved.', 'good');
    });
    this.pausedOverlay.querySelector('[data-help]')?.addEventListener('click', () => {
      this.togglePause();
      this.screens.open('help');
    });
    this.pausedOverlay.querySelector('[data-quit]')?.addEventListener('click', () => {
      if (confirm('Abandon this world and start over?')) this.resetWorld();
    });

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    this.canvas.addEventListener('pointerdown', () => {
      if (!this.screens.isOpen && !this.paused && !this.settings.touchControls) {
        this.audio.start();
        this.audio.resume();
        this.input.requestPointerLock();
      }
    });
  }

  private pixelRatio(): number {
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const max = isMobile ? RENDER.mobilePixelRatio : RENDER.maxPixelRatio;
    return Math.min(window.devicePixelRatio || 1, max);
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  async boot(): Promise<void> {
    this.loadSettings();
    this.setLoading(6, 'Loading textures…');
    await this.frame();

    const atlas = createAtlasTexture();
    this.materials = createVoxelMaterials(atlas);
    this.skyMaterial = createSkyMaterial();
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(RENDER.skyRadius, 24, 16), this.skyMaterial));

    this.setLoading(18, 'Reading the shift log…');
    await this.frame();

    const save = this.loadSave();
    // A ?seed= parameter makes a world reproducible (and shareable).
    const urlSeed = new URLSearchParams(window.location.search).get('seed');
    const parsedSeed = urlSeed !== null ? Number.parseInt(urlSeed, 10) : NaN;
    this.seed = save?.seed ?? (Number.isFinite(parsedSeed) ? parsedSeed >>> 0 : Math.floor(Math.random() * 0xffffffff));

    this.setLoading(30, 'Carving the Sulfur Basin…');
    await this.frame();
    this.world = new World(this.seed);

    this.setLoading(58, 'Propping up the mine shaft…');
    await this.frame();
    if (save?.edits?.length) {
      this.world.applyEdits(save.edits);
    }

    this.setLoading(72, 'Waking up BOLT-7…');
    await this.frame();

    this.player = new Player(this);
    this.robot = new Robot(this);
    this.mobs = new MobManager(this);
    this.items = new ItemManager(this);
    this.particles = new ParticleSystem();

    this.world.attach(this.scene, this.materials);
    this.items.attach(this.scene);
    this.mobs.attach(this.scene);
    this.particles.attach(this.scene);
    this.scene.add(this.robot.model.group);
    this.scene.add(this.player.model.group);

    this.hud = new HUD(this);
    this.screens = new Screens(this);
    this.touch = new TouchControls(this, this.input);
    const ui = document.getElementById('ui-root') as HTMLElement;
    ui.appendChild(this.hud.root);
    ui.appendChild(this.screens.root);
    ui.appendChild(this.touch.root);

    // Minimap lives in the top-right stack.
    const topRight = this.hud.root.querySelector('.hud-top-right') as HTMLElement;
    topRight.insertBefore(this.minimap.canvas, topRight.firstChild);

    if (save) {
      this.applySave(save);
    } else {
      const spawn = this.world.terrain.spawn;
      this.player.spawnAt(spawn.x, spawn.y, spawn.z);
      this.robot.spawnAt(spawn.x + 1.5, spawn.y, spawn.z);
      this.inventory.add('pickaxe_wood', 1);
      this.inventory.add('torch', 8);
      this.inventory.add('planks', 8);
    }

    this.setLoading(88, 'Building the surface…');
    await this.frame();

    // Prime the chunks around the player.
    this.updateChunks(true);

    this.applySettings();
    this.setLoading(100, 'Ready');
    await this.frame();

    const loading = document.getElementById('loading-screen');
    loading?.classList.add('hidden');
    window.setTimeout(() => loading?.remove(), 700);

    this.notify(`Welcome to ${GAME_TITLE}. BOLT-7 is online.`, 'good');
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private frame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  private setLoading(percent: number, status: string): void {
    if (this.loadingFill) this.loadingFill.style.width = `${percent}%`;
    if (this.loadingStatus) this.loadingStatus.textContent = status;
    const tip = document.getElementById('loading-tip');
    if (tip) {
      const tips = [
        'Sulfur dust sells well — but it stings your lungs.',
        'BOLT-7 mines on its own. Keep it charged.',
        'Torches light the shaft. Place them as you dig.',
        'Diamonds hide below y=18. Bring a steel pickaxe.',
        'Build a Smelter to turn raw ore into ingots.',
        'The cave dwellers hunt in the dark. Keep your sword handy.',
      ];
      tip.textContent = tips[Math.floor(Math.random() * tips.length)];
    }
  }

  /* ------------------------------------------------------------------ */
  /* Settings & persistence                                             */
  /* ------------------------------------------------------------------ */

  private loadSettings(): void {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch && localStorage.getItem(SETTINGS_KEY) === null) {
      this.settings.touchControls = true;
      // A phone cannot afford the full view distance.
      this.settings.renderDistance = RENDER.mobileRenderDistance;
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage unavailable */
    }
  }

  applySettings(): void {
    this.saveSettings();
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.audio.setVolume(this.settings.volume);
    this.touch?.setEnabled(this.settings.touchControls);
    this.renderer.setPixelRatio(this.pixelRatio());
    this.onResize();
    if (this.hud) this.hud.root.querySelector('.fps-badge')?.classList.toggle('hidden', !this.settings.showFps);
  }

  private loadSave(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (data.version !== 1) return null;
      return data;
    } catch {
      return null;
    }
  }

  private applySave(save: SaveData): void {
    this.time = save.time ?? 0.28;
    this.credits = save.credits ?? START_CREDITS;
    this.inventory = Inventory.fromJSON(save.inventory as never);
    this.upgrades = new Set(save.upgrades ?? []);
    this.completedQuests = new Set(save.quests ?? []);
    this.stats = Stats.fromJSON((save.stats as Record<string, unknown>) ?? {});
    this.player.spawnAt(save.player.x, save.player.y, save.player.z);
    this.player.yaw = save.player.yaw;
    this.player.pitch = save.player.pitch;
    this.player.health = save.player.health;
    this.player.maxHealth = save.player.maxHealth ?? PLAYER.maxHealth;
    this.robot.loadJSON(save.robot as never);
    if (this.upgrades.has('backpack')) this.inventory.resize(63);
    this.applyGear();
  }

  saveGame(): void {
    if (!this.world) return;
    const edits: Array<[number, number]> = [];
    for (const [i, id] of this.world.edits.entries()) edits.push([i, id]);
    const data: SaveData = {
      version: 1,
      seed: this.seed,
      time: this.time,
      credits: this.credits,
      player: {
        x: this.player.pos.x,
        y: this.player.pos.y,
        z: this.player.pos.z,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
        health: this.player.health,
        maxHealth: this.player.maxHealth,
      },
      inventory: this.inventory.toJSON(),
      upgrades: [...this.upgrades],
      quests: [...this.completedQuests],
      stats: this.stats.toJSON(),
      edits,
      robot: this.robot.toJSON(),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      this.notify('Could not save — storage is full.', 'warn');
    }
  }

  resetWorld(): void {
    localStorage.removeItem(SAVE_KEY);
    window.location.reload();
  }

  /* ------------------------------------------------------------------ */
  /* Gameplay helpers                                                   */
  /* ------------------------------------------------------------------ */

  hasUpgrade(id: string): boolean {
    return this.upgrades.has(id);
  }

  currentTool(): { stack: ItemStack; def: ItemDef } | null {
    const slot = this.inventory.getSelected();
    if (!slot) return null;
    const def = itemDef(slot.id);
    return def.tool ? { stack: slot, def } : null;
  }

  get surfaceHeight(): number {
    return this.world.terrain.heightMap[
      Math.min(WORLD_X - 1, Math.max(0, Math.floor(this.player.pos.x))) +
        Math.min(WORLD_Z - 1, Math.max(0, Math.floor(this.player.pos.z))) * WORLD_X
    ];
  }

  clockString(): string {
    const hours = Math.floor(this.time * 24);
    const minutes = Math.floor((this.time * 24 - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  notify(text: string, kind: 'good' | 'warn' | 'bad' | 'info' = 'info'): void {
    this.hud?.notify(text, kind);
  }

  flashDamage(): void {
    this.hud?.flashDamage();
  }

  addCredits(amount: number): void {
    this.credits += amount;
    if (amount > 0) this.stats.add('creditsEarned', amount);
  }

  spawnDrop(itemId: string, count: number, position: THREE.Vector3): void {
    if (!itemId || count <= 0) return;
    this.items.spawn(itemId, count, position);
  }

  spawnBlockParticles(position: THREE.Vector3, blockId: number, count = 10): void {
    const color = new THREE.Color(0xffffff);
    color.setHSL(0.1, 0.1, 0.55);
    switch (blockId) {
      case Block.STONE:
      case Block.COBBLESTONE:
      case Block.DEEPSLATE:
        color.setHex(0x7d7d7d);
        break;
      case Block.DIRT:
        color.setHex(0x8b5a2b);
        break;
      case Block.GRASS:
        color.setHex(0x4f9b3a);
        break;
      case Block.SAND:
      case Block.SULFUR_SAND:
        color.setHex(0xddd3a0);
        break;
      case Block.SULFUR_ORE:
      case Block.SULFUR_CRYSTAL:
      case Block.SULFUR_BLOCK:
        color.setHex(0xe8d24a);
        break;
      case Block.COAL_ORE:
        color.setHex(0x2b2b2b);
        break;
      case Block.IRON_ORE:
        color.setHex(0xd7a883);
        break;
      case Block.GOLD_ORE:
      case Block.GOLD_BLOCK:
        color.setHex(0xf0c33c);
        break;
      case Block.DIAMOND_ORE:
        color.setHex(0x4fe0dc);
        break;
      case Block.LOG:
      case Block.PLANK:
        color.setHex(0x8a6338);
        break;
      case Block.LEAVES:
        color.setHex(0x3f7a2c);
        break;
      case Block.LAVA:
        color.setHex(0xff8b2a);
        break;
      case Block.WATER:
        color.setHex(0x3f7fd8);
        break;
      case Block.ASH:
        color.setHex(0x5d5a57);
        break;
      case Block.MOSSY_STONE:
        color.setHex(0x5d7a46);
        break;
      default:
        color.setHex(0xa0a0a0);
    }
    this.particles.spawn(position, color, count, 2.6, 0.4, 16, 0.85);
  }

  /** Break a block: drops, stats, particles and sounds. */
  breakBlock(x: number, y: number, z: number, blockId: number): void {
    const def = blockDef(blockId);
    const world = this.world;
    if (blockId === Block.BEDROCK) {
      this.notify('Bedrock refuses to break.', 'warn');
      return;
    }
    world.setBlock(x, y, z, Block.AIR);

    const tool = this.currentTool();
    const tierOk = def.tier === 0 || (tool !== null && (tool.def.tool?.tier ?? 0) >= def.tier);
    let dropItem = def.drop;
    let dropCount = def.dropCount || 1;

    if (tierOk && dropItem) {
      if (this.hasUpgrade('auto_smelt')) {
        if (dropItem === 'raw_iron') dropItem = 'iron_ingot';
        else if (dropItem === 'raw_gold') dropItem = 'gold_ingot';
      }
      this.spawnDrop(dropItem, dropCount, new THREE.Vector3(x + 0.5, y + 0.4, z + 0.5));
      this.stats.recordMined(dropItem);
      if (dropItem === 'sulfur_dust') this.stats.add('sulfurDusted', dropCount);
      if (dropItem === 'sulfur_crystal') this.stats.add('crystalsFound', dropCount);
    }

    this.stats.add('blocksMined');
    this.audio.breakBlock(def.sound);
    this.spawnBlockParticles(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), blockId, 12);

    // Tool wear.
    if (tool && tool.stack.durability !== undefined) {
      const broke = this.inventory.damageSelected(1);
      if (broke) this.notify(`Your ${tool.def.name} broke.`, 'warn');
    }

    this.checkQuests();
    this.scheduleSave();
  }

  /** The robot mined a block: the loot goes into its cargo. */
  robotBrokeBlock(x: number, y: number, z: number, blockId: number): void {
    const def = blockDef(blockId);
    this.world.setBlock(x, y, z, Block.AIR);
    this.stats.add('robotBlocks');
    this.stats.recordMined(def.drop);
    this.checkQuests();
    this.scheduleSave();
  }

  /* ------------------------------------------------------------------ */
  /* Crafting, market, upgrades                                          */
  /* ------------------------------------------------------------------ */

  craft(recipe: Recipe): boolean {
    if (recipe.station === 'smelter' && !this.nearSmelter) {
      this.notify('You need a Smelter nearby.', 'warn');
      return false;
    }
    for (const ing of recipe.ingredients) {
      if (!this.inventory.has(ing.item, ing.count)) {
        this.notify(`Missing ${itemDef(ing.item).name}.`, 'warn');
        return false;
      }
    }
    for (const ing of recipe.ingredients) this.inventory.remove(ing.item, ing.count);
    this.inventory.add(recipe.output.item, recipe.output.count);
    this.audio.beep(520, 0.1);
    this.notify(`Crafted ${itemDef(recipe.output.item).name}.`, 'good');
    if (recipe.output.item === 'iron_ingot' || recipe.output.item === 'gold_ingot' || recipe.output.item === 'steel_ingot') {
      this.stats.add('smelted');
    }
    if (recipe.output.item === 'glass') {
      // Glass needs sulfur sand which is a block item; the recipe uses the item id.
    }
    this.checkQuests();
    this.scheduleSave();
    return true;
  }

  sellItem(id: string): void {
    const def = itemDef(id);
    if (def.value <= 0) return;
    const count = this.inventory.count(id);
    if (count <= 0) return;
    this.inventory.remove(id, count);
    const total = count * def.value;
    this.addCredits(total);
    this.audio.beep(760, 0.09);
    this.notify(`Sold ${count} × ${def.name} for ${total} credits.`, 'good');
    this.checkQuests();
    this.scheduleSave();
  }

  buyUpgrade(id: string): boolean {
    const def = upgradeById(id);
    if (!def) return false;
    if (this.upgrades.has(id)) return false;
    if (def.requires && !def.requires.every((r) => this.inventory.has(r.item, r.count))) {
      this.notify('You are missing the required parts.', 'warn');
      return false;
    }
    if (this.credits < def.cost) {
      this.notify('Not enough credits.', 'warn');
      return false;
    }
    this.credits -= def.cost;
    for (const r of def.requires ?? []) this.inventory.remove(r.item, r.count);
    this.upgrades.add(id);
    this.audio.beep(880, 0.18);
    this.notify(`Installed ${def.name}.`, 'good');
    if (id === 'backpack') this.inventory.resize(63);
    if (id === 'deep_suit') {
      this.player.maxHealth = PLAYER.maxHealth + 5;
    }
    this.scheduleSave();
    return true;
  }

  applyGear(): void {
    const gear = this.inventory.gear;
    const canLight = gear?.id === 'lantern' || this.upgrades.has('lantern_module');
    this.pointLight.visible = this.player.lanternOn && canLight;
  }

  sortInventory(): void {
    const order = [...this.inventory.slots].filter((s): s is ItemStack => s !== null);
    const tools = order.filter((s) => itemDef(s.id).tool);
    const blocks = order.filter((s) => itemDef(s.id).place !== undefined);
    const rest = order.filter((s) => !itemDef(s.id).tool && itemDef(s.id).place === undefined);
    const merged = [...tools, ...blocks, ...rest];
    for (let i = 0; i < this.inventory.slots.length; i++) {
      this.inventory.slots[i] = merged[i] ?? null;
    }
  }

  dropJunk(): void {
    for (let i = this.inventory.slots.length - 1; i >= 0; i--) {
      const slot = this.inventory.slots[i];
      if (!slot) continue;
      const def = itemDef(slot.id);
      if (def.value > 0 || def.tool || def.place !== undefined || def.food) continue;
      this.spawnDrop(slot.id, slot.count, this.player.pos.clone().setY(this.player.pos.y + 0.8));
      this.inventory.slots[i] = null;
    }
    this.notify('Junk dropped.', 'info');
  }

  /* ------------------------------------------------------------------ */
  /* Quests                                                             */
  /* ------------------------------------------------------------------ */

  private refreshActiveQuest(): void {
    this.activeQuest = QUESTS.find((q) => !this.completedQuests.has(q.id)) ?? null;
  }

  /** Re-evaluate the contract list and pay out completed contracts. */
  checkQuests(): void {
    for (const quest of QUESTS) {
      if (this.completedQuests.has(quest.id)) continue;
      const progress = this.stats.get(quest.stat);
      if (progress >= quest.goal) {
        this.completedQuests.add(quest.id);
        this.addCredits(quest.reward);
        this.notify(`Contract complete: ${quest.name} (+${quest.reward} cr)`, 'good');
        this.audio.beep(990, 0.2);
        this.scheduleSave();
      }
    }
    this.refreshActiveQuest();
  }

  /* ------------------------------------------------------------------ */
  /* Interaction                                                         */
  /* ------------------------------------------------------------------ */

  /** Use the selected item on the targeted block (place, equip, operate machines). */
  useBlock(): void {
    const hit = this.world.raycast(this.player.eyePosition, this.player.lookDirection, PLAYER.reach);
    const selected = this.inventory.getSelected();
    if (!selected) return;

    const def = itemDef(selected.id);

    // Gear items are worn instead of placed.
    if (def.gear) {
      this.inventory.gear = { id: selected.id, count: 1 };
      this.inventory.consumeSelected(1);
      this.applyGear();
      this.notify(`Equipped ${def.name}.`, 'good');
      this.audio.ui();
      return;
    }

    if (!hit) return;

    // Machine blocks have their own interactions.
    const targetBlock = this.world.getBlock(hit.x, hit.y, hit.z);
    if (targetBlock === Block.SMELTER && def.place === undefined) {
      this.smeltOne();
      return;
    }
    if (targetBlock === Block.CHARGER && def.place === undefined) {
      this.robot.recharge(35);
      return;
    }
    if (targetBlock === Block.BEACON && def.place === undefined) {
      this.robot.recall();
      return;
    }

    if (def.place === undefined) return;

    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    const existing = this.world.getBlock(x, y, z);
    if (existing !== Block.AIR && !blockDef(existing).liquid) return;

    // Do not place a block inside the player or the robot.
    if (this.intersectsEntity(x, y, z, this.player.pos, PLAYER.width / 2, PLAYER.height)) return;

    this.world.setBlock(x, y, z, def.place);
    this.inventory.consumeSelected(1);
    this.stats.add('blocksPlaced');
    this.audio.dig(blockDef(def.place).sound);
    this.spawnBlockParticles(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), def.place, 5);
    this.checkQuests();
    this.scheduleSave();
  }

  private smeltOne(): void {
    const recipes = allRecipes().filter((r) => r.station === 'smelter');
    for (const recipe of recipes) {
      if (recipe.ingredients.every((ing) => this.inventory.has(ing.item, ing.count))) {
        if (this.craft(recipe)) {
          this.notify(`Smelted ${itemDef(recipe.output.item).name}.`, 'good');
        }
        return;
      }
    }
    this.notify('Nothing smeltable in your pack.', 'warn');
  }

  private intersectsEntity(
    bx: number,
    by: number,
    bz: number,
    pos: THREE.Vector3,
    half: number,
    height: number,
  ): boolean {
    return (
      pos.x + half > bx &&
      pos.x - half < bx + 1 &&
      pos.z + half > bz &&
      pos.z - half < bz + 1 &&
      pos.y + height > by &&
      pos.y < by + 1
    );
  }

  /** Swing at a creature if one is in front of the player. */
  private tryAttack(): void {
    if (!this.input.state.mine) return;
    const now = performance.now();
    if (now - this.lastAttack < 320) return;
    this.lastAttack = now;

    const eye = this.player.eyePosition;
    const dir = this.player.lookDirection;
    for (const mob of this.mobs.mobs) {
      const dx = mob.pos.x - eye.x;
      const dy = mob.pos.y + 0.5 - eye.y;
      const dz = mob.pos.z - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 3.4) continue;
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (dist || 1);
      if (dot < 0.72) continue;
      const tool = this.currentTool();
      const damage = tool ? tool.def.tool?.damage ?? 1 : 2;
      this.mobs.hit(mob, damage, this.player.pos.x, this.player.pos.z);
      this.player.swingTimer = 0.28;
      return;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Input handling                                                      */
  /* ------------------------------------------------------------------ */

  private onKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    const code = e.code;

    if (code === 'Escape') {
      e.preventDefault();
      if (this.screens.isOpen) this.screens.close();
      else this.togglePause();
      return;
    }
    if (this.screens.isOpen) {
      if (code === 'KeyE' || code === 'KeyC' || code === 'KeyU' || code === 'KeyM') {
        e.preventDefault();
        this.screens.close();
      }
      return;
    }

    switch (code) {
      case 'KeyE':
        this.screens.open('inventory');
        break;
      case 'KeyC':
        this.screens.open('crafting');
        break;
      case 'KeyU':
        this.screens.open('upgrades');
        break;
      case 'KeyM':
        this.screens.open('market');
        break;
      case 'KeyG':
        this.robot.scan();
        break;
      case 'KeyR':
        this.robot.recall();
        break;
      case 'KeyT':
        this.robot.state = this.robot.state === 'MINE' ? 'FOLLOW' : 'MINE';
        this.notify(
          this.robot.state === 'MINE' ? 'BOLT-7: mining freely.' : 'BOLT-7: following you.',
          'info',
        );
        break;
      case 'KeyF':
        if (this.inventory.gear?.id === 'lantern' || this.upgrades.has('lantern_module')) {
          this.player.lanternOn = !this.player.lanternOn;
          this.pointLight.visible = this.player.lanternOn;
          this.notify(this.player.lanternOn ? 'Lantern on.' : 'Lantern off.', 'info');
        } else {
          this.notify('No lantern equipped.', 'warn');
        }
        break;
      case 'KeyV':
        this.toggleViewMode();
        break;
      case 'KeyQ':
        this.inventory.scroll(e.shiftKey ? -1 : 1);
        break;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Digit7':
      case 'Digit8':
      case 'Digit9':
        this.inventory.select(Number(code.slice(5)) - 1);
        break;
      case 'KeyP':
        this.saveGame();
        this.notify('Progress saved.', 'good');
        break;
      default:
        break;
    }
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.pausedOverlay.classList.toggle('hidden', !this.paused);
    this.input.setBlocked(this.paused || this.screens.isOpen);
    if (this.paused) this.input.exitPointerLock();
  }

  toggleViewMode(): void {
    this.player.viewMode = this.player.viewMode === 'first' ? 'third' : 'first';
    this.player.model.group.visible = this.player.viewMode === 'third';
    this.notify(this.player.viewMode === 'third' ? 'Third person.' : 'First person.', 'info');
  }

  /** Called when the player dies — shows the respawn banner. */
  onPlayerDied(cause: string): void {
    this.hud?.notify(`Respawning at the company shaft… (${cause})`, 'bad');
  }

  onScreenOpened(): void {
    this.input.setBlocked(true);
    this.input.exitPointerLock();
  }

  onScreenClosed(): void {
    this.input.setBlocked(this.paused);
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private scheduleSave(): void {
    this.saveTimer = Math.min(this.saveTimer, 3);
  }

  /* ------------------------------------------------------------------ */
  /* Chunk streaming                                                     */
  /* ------------------------------------------------------------------ */

  private updateChunks(force = false): void {
    const pcx = Math.floor(this.player.pos.x / 16);
    const pcz = Math.floor(this.player.pos.z / 16);
    const dist = this.settings.renderDistance;

    let best: { cx: number; cz: number; d: number } | null = null;
    let bestD = Infinity;

    for (let dz = -dist; dz <= dist; dz++) {
      for (let dx = -dist; dx <= dist; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (cx < 0 || cz < 0 || cx >= WORLD_X / 16 || cz >= WORLD_Z / 16) continue;
        const d = dx * dx + dz * dz;
        if (d > dist * dist) continue;
        const chunk = this.world.ensureChunk(cx, cz);
        chunk.lastSeen = this.elapsed;
        if (chunk.dirty) {
          if (d < bestD) {
            bestD = d;
            best = { cx, cz, d };
          }
        }
      }
    }

    // Rebuild dirty chunks within a small time budget so the world fills in
    // quickly without dropping frames.
    const budgetEnd = performance.now() + RENDER.chunkBudgetMs;
    while (best && performance.now() < budgetEnd) {
      this.world.rebuildChunk(best.cx, best.cz);
      best = this.nextDirtyChunk(pcx, pcz, dist, best.cx, best.cz);
    }

    // Unload chunks that are far away.
    for (const chunk of this.world.listChunks()) {
      const d = Math.hypot(chunk.cx - pcx, chunk.cz - pcz);
      if (d > dist + 3) this.world.unloadChunk(chunk.cx, chunk.cz);
    }
    void force;
  }

  /** Find the closest still-dirty chunk, ignoring the one just built. */
  private nextDirtyChunk(
    pcx: number,
    pcz: number,
    dist: number,
    skipX: number,
    skipZ: number,
  ): { cx: number; cz: number; d: number } | null {
    let best: { cx: number; cz: number; d: number } | null = null;
    let bestD = Infinity;
    for (let dz = -dist; dz <= dist; dz++) {
      for (let dx = -dist; dx <= dist; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (cx < 0 || cz < 0 || cx >= WORLD_X / 16 || cz >= WORLD_Z / 16) continue;
        if (cx === skipX && cz === skipZ) continue;
        const d = dx * dx + dz * dz;
        if (d > dist * dist) continue;
        const chunk = this.world.getChunk(cx, cz);
        if (!chunk || !chunk.dirty) continue;
        if (d < bestD) {
          bestD = d;
          best = { cx, cz, d };
        }
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* Sky & day/night                                                     */
  /* ------------------------------------------------------------------ */

  private updateSky(dt: number): void {
    this.time = (this.time + dt / DAY_LENGTH) % 1;

    const angle = this.time * Math.PI * 2 - Math.PI / 2;
    const sunY = Math.cos(angle);
    const sunX = Math.sin(angle) * 0.6;
    const sunZ = Math.sin(angle) * 0.8;
    const sunDir = new THREE.Vector3(sunX, sunY, sunZ).normalize();

    const day = THREE.MathUtils.clamp((sunY + 0.18) / 0.36, 0, 1);
    const dusk = Math.max(0, 1 - Math.abs(sunY) / 0.28);

    const zenithNight = new THREE.Color(0x050813);
    const zenithDay = new THREE.Color(0x2f6fd0);
    const zenithDusk = new THREE.Color(0x2b3f7d);
    const horizonNight = new THREE.Color(0x0b1020);
    const horizonDay = new THREE.Color(0xa8c8ea);
    const horizonDusk = new THREE.Color(0xe8894a);

    const zenith = zenithNight.clone().lerp(zenithDay, day).lerp(zenithDusk, dusk * 0.75);
    const horizon = horizonNight.clone().lerp(horizonDay, day).lerp(horizonDusk, dusk * 0.85);

    const u = this.skyMaterial.uniforms;
    u.uZenith.value.copy(zenith);
    u.uHorizon.value.copy(horizon);
    u.uGround.value.copy(horizon).multiplyScalar(0.35);
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.setHex(day > 0.4 ? 0xfff2cc : 0xff9a4d);
    u.uStars.value = 1 - day;
    u.uTime.value = this.elapsed;

    // Fog follows the horizon colour; underground it becomes dark and close.
    const depth = Math.max(0, this.surfaceHeight - this.player.pos.y);
    const underground = THREE.MathUtils.clamp(depth / 12, 0, 1);
    const fogColor = horizon.clone().lerp(new THREE.Color(0x0a0b0f), underground * 0.92);
    const fogNear = 14 - underground * 8;
    // The fog has to end before the edge of the meshed area, otherwise the
    // miner sees the world simply stop.
    const visible = this.settings.renderDistance * 16 * 0.92;
    const fogFar = Math.min(RENDER.fogFar, visible) * (1 - underground * 0.55);
    this.materials.setFog(fogColor, fogNear, fogFar);
    this.materials.setDay(0.12 + day * 0.88);
    this.materials.uniforms.uTime.value = this.elapsed;

    this.ambientLight.intensity = 0.35 + day * 0.45;
    this.ambientLight.color.copy(horizon).lerp(new THREE.Color(0xffffff), 0.55);

    this.renderer.setClearColor(fogColor, 1);
  }

  /* ------------------------------------------------------------------ */
  /* Main loop                                                           */
  /* ------------------------------------------------------------------ */

  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.elapsed += dt;

    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = this.frames / this.fpsTimer;
      this.frames = 0;
      this.fpsTimer = 0;
    }

    if (!this.paused && !this.screens.isOpen) {
      this.update(dt);
    } else {
      this.input.update();
    }

    if (this.graphicsAvailable) this.renderer.render(this.scene, this.camera);
  }

  private update(dt: number): void {
    this.input.update();

    // Touch look: drag anywhere on the right half of the screen.
    this.handleTouchLook();

    this.player.update(dt, this.input);
    this.robot.update(dt);
    this.mobs.update(dt);
    this.items.update(dt);
    this.particles.update(dt);

    if (this.input.state.place) {
      this.input.state.place = false;
      this.useBlock();
    }
    this.tryAttack();

    // Track depth + quests.
    const currentDepth = Math.max(0, Math.round(this.surfaceHeight - this.player.pos.y));
    if (currentDepth > this.stats.depthReached) {
      this.stats.depthReached = currentDepth;
      if (currentDepth % 10 === 0) this.notify(`Depth record: ${currentDepth} m`, 'good');
    }

    // Nearby smelter check.
    this.nearSmelter = false;
    for (let dy = -2; dy <= 2 && !this.nearSmelter; dy++) {
      for (let dz = -2; dz <= 2 && !this.nearSmelter; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (
            this.world.getBlock(
              Math.floor(this.player.pos.x) + dx,
              Math.floor(this.player.pos.y) + dy,
              Math.floor(this.player.pos.z) + dz,
            ) === Block.SMELTER
          ) {
            this.nearSmelter = true;
            break;
          }
        }
      }
    }

    // Personal lantern light.
    if (this.pointLight.visible) {
      this.pointLight.position.set(
        this.player.pos.x,
        this.player.pos.y + 1.2,
        this.player.pos.z,
      );
      this.pointLight.intensity = 1.6;
    }

    this.updateSky(dt);
    this.updateChunks();

    // Ambience.
    const undergroundDepth = Math.max(0, this.surfaceHeight - this.player.pos.y);
    this.audio.setAmbience(THREE.MathUtils.clamp(undergroundDepth / 18, 0, 1));

    // UI refresh (throttled).
    this.hud.update(dt, this.fps);
    this.uiTimer = (this.uiTimer ?? 0) + dt;
    if (this.uiTimer > 0.2) {
      this.uiTimer = 0;
      this.minimap.render(this);
      if (this.screens.isOpen) this.screens.render();
    }

    // Auto save.
    this.saveTimer += dt;
    if (this.saveTimer > 25 && this.autoSaveEnabled) {
      this.saveTimer = 0;
      this.saveGame();
    }
  }

  private uiTimer = 0;
  private lastAttack = 0;

  private touchLookPointer = -1;
  private touchLookLast = { x: 0, y: 0 };

  private handleTouchLook(): void {
    if (!this.settings.touchControls) return;
    const canvas = this.canvas;
    const onDown = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return;
      if (e.clientX < window.innerWidth * 0.35) return;
      this.touchLookPointer = e.pointerId;
      this.touchLookLast = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent): void => {
      if (e.pointerId !== this.touchLookPointer) return;
      const dx = e.clientX - this.touchLookLast.x;
      const dy = e.clientY - this.touchLookLast.y;
      this.touchLookLast = { x: e.clientX, y: e.clientY };
      this.input.addTouchLook(dx * 1.35, dy * 1.35);
    };
    const onUp = (e: PointerEvent): void => {
      if (e.pointerId === this.touchLookPointer) this.touchLookPointer = -1;
    };
    if (!this.touchLookBound) {
      this.touchLookBound = true;
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
    }
  }

  private touchLookBound = false;
}
