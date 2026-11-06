import { itemIcon } from '../render/textures';
import { itemDef } from '../game/items';
import { blockDef } from '../world/blocks';
import { robotStateLabel } from '../entities/robot';
import { PLAYER } from '../core/constants';
import type { Game } from '../game/game';

const BIOME_NAMES = ['Verdant Flats', 'Ash Badlands', 'The Caldera'];

const COMPASS_POINTS: Array<[number, string]> = [
  [0, 'S'],
  [45, 'SW'],
  [90, 'W'],
  [135, 'NW'],
  [180, 'N'],
  [225, 'NE'],
  [270, 'E'],
  [315, 'SE'],
];

/** The name of the biome the miner is standing in. */
function biomeName(
  biomeMap: Uint8Array | undefined,
  pos: { x: number; y: number; z: number },
): string {
  // Under the surface the caves have their own name.
  if (pos.y < 18) return 'The Deep Caverns';
  if (!biomeMap) return 'Verdant Flats';
  const x = Math.floor(pos.x);
  const z = Math.floor(pos.z);
  const width = 128;
  if (x < 0 || z < 0 || x >= width) return 'The Deep';
  return BIOME_NAMES[biomeMap[x + z * width]] ?? 'Verdant Flats';
}

/** Heads-up display: vitals, hotbar, compass, robot panel and contracts. */
export class HUD {
  readonly root: HTMLDivElement;
  private crosshair!: HTMLElement;
  private mineProgress!: HTMLElement;
  private mineProgressCircle: SVGCircleElement;
  private healthBar: HTMLElement;
  private healthValue: HTMLElement;
  private staminaBar: HTMLElement;
  private gasBar: HTMLElement;
  private gasPill: HTMLElement;
  private gasValue: HTMLElement;
  private creditsChip: HTMLElement;
  private creditsValue: HTMLElement;
  private depthChip: HTMLElement;
  private depthValue: HTMLElement;
  private clockChip: HTMLElement;
  /** Last value written to a DOM node — the HUD only touches what changed. */
  private readonly domCache = new Map<string, string>();
  private compassStrip: HTMLElement;
  private hotbar: HTMLElement;
  private heldName: HTMLElement;
  private robotPanel: HTMLElement;
  private robotBattery: HTMLElement;
  private robotState: HTMLElement;
  private robotCargo: HTMLElement;
  private contractPanel: HTMLElement;
  private contractName: HTMLElement;
  private contractGoal: HTMLElement;
  private contractProgress: HTMLElement;
  private toasts!: HTMLElement;
  private damageVignette: HTMLElement;
  private gasVignette: HTMLElement;
  private flash: HTMLElement;
  private fpsBadge: HTMLElement;
  private hitMarker: HTMLElement;
  private targetName: HTMLElement;
  private biomeChip: HTMLElement;
  private slots: HTMLElement[] = [];
  private hitTimer = 0;
  private targetTimer = 0;
  private lastHeldId = '';
  private lastSelected = -1;
  private toastTimers: number[] = [];

  constructor(private readonly game: Game) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="crosshair">
        <span class="ch-h"></span><span class="ch-v"></span>
      </div>
      <div class="hit-marker" data-hitmarker>
        <i></i><i></i>
      </div>
      <div class="target-name" data-target></div>
      <div class="mine-progress" style="display:none">
        <svg viewBox="0 0 54 54">
          <circle class="track" cx="27" cy="27" r="24"></circle>
          <circle class="prog" cx="27" cy="27" r="24"></circle>
        </svg>
      </div>
      <div class="compass">
        <div class="compass-strip"></div>
        <div class="compass-needle"></div>
      </div>
      <div class="hud-top-left">
        <div class="stat-row">
          <div class="stat-pill">
            <span class="label">HP</span>
            <span class="value" data-hp>20</span>
          </div>
          <div class="stat-pill" style="min-width:110px">
            <div class="bar health"><i data-hpbar></i></div>
          </div>
        </div>
        <div class="stat-row">
          <div class="stat-pill" style="min-width:110px">
            <div class="bar stamina"><i data-staminabar></i></div>
          </div>
        </div>
        <div class="stat-row" data-gasrow>
          <div class="stat-pill">
            <span class="label">Air</span>
            <span class="value" data-gas>100%</span>
          </div>
          <div class="stat-pill" style="min-width:110px">
            <div class="bar gas"><i data-gasbar></i></div>
          </div>
        </div>
      </div>
      <div class="hud-top-right">
        <div class="chip" data-credits><b>0</b> credits</div>
        <div class="chip" data-depth>Depth <b>0</b> m</div>
        <div class="chip" data-clock>06:00</div>
        <div class="chip biome" data-biome>Verdant Flats</div>
      </div>
      <div class="robot-panel">
        <h4><span>BOLT-7</span><span data-robotstate>FOLLOWING</span></h4>
        <div class="row"><span>Battery</span><div class="bar battery" style="flex:1"><i data-robotbattery></i></div></div>
        <div class="row"><span>Cargo</span><b data-robotcargo>0 / 8</b></div>
      </div>
      <div class="contract">
        <h4>Contract</h4>
        <div data-contractname>First Shift</div>
        <div class="goal"><span data-contractgoal>Break 15 blocks</span><b data-contractprogress>0/15</b></div>
        <div class="bar stamina" style="margin-top:6px"><i data-contractbar></i></div>
      </div>
      <div class="toasts"></div>
      <div class="vignette damage" data-damage></div>
      <div class="vignette gas" data-gasvig></div>
      <div class="vignette flash" data-flash></div>
      <div class="hud-bottom">
        <div class="held-name" data-held></div>
        <div class="hotbar" data-hotbar></div>
      </div>
      <div class="fps-badge" data-fps></div>
    `;

    this.crosshair = this.root.querySelector('.crosshair') as HTMLDivElement;
    this.mineProgress = this.root.querySelector('.mine-progress') as HTMLDivElement;
    this.mineProgressCircle = this.root.querySelector('.mine-progress .prog') as SVGCircleElement;
    this.healthBar = this.root.querySelector('[data-hpbar]') as HTMLElement;
    this.healthValue = this.root.querySelector('[data-hp]') as HTMLElement;
    this.staminaBar = this.root.querySelector('[data-staminabar]') as HTMLElement;
    this.gasBar = this.root.querySelector('[data-gasbar]') as HTMLElement;
    this.gasValue = this.root.querySelector('[data-gas]') as HTMLElement;
    this.gasPill = this.root.querySelector('[data-gasrow]') as HTMLElement;
    this.creditsChip = this.root.querySelector('[data-credits]') as HTMLElement;
    this.creditsValue = this.creditsChip.querySelector('b') as HTMLElement;
    this.depthChip = this.root.querySelector('[data-depth]') as HTMLElement;
    this.depthValue = this.depthChip.querySelector('b') as HTMLElement;
    this.clockChip = this.root.querySelector('[data-clock]') as HTMLElement;
    this.compassStrip = this.root.querySelector('.compass-strip') as HTMLElement;
    this.hotbar = this.root.querySelector('[data-hotbar]') as HTMLElement;
    this.heldName = this.root.querySelector('[data-held]') as HTMLElement;
    this.robotPanel = this.root.querySelector('.robot-panel') as HTMLElement;
    this.robotBattery = this.root.querySelector('[data-robotbattery]') as HTMLElement;
    this.robotState = this.root.querySelector('[data-robotstate]') as HTMLElement;
    this.robotCargo = this.root.querySelector('[data-robotcargo]') as HTMLElement;
    this.contractPanel = this.root.querySelector('.contract') as HTMLElement;
    this.contractName = this.root.querySelector('[data-contractname]') as HTMLElement;
    this.contractGoal = this.root.querySelector('[data-contractgoal]') as HTMLElement;
    this.contractProgress = this.root.querySelector('[data-contractprogress]') as HTMLElement;
    this.contractProgressBar = this.root.querySelector('[data-contractbar]') as HTMLElement;
    this.toasts = this.root.querySelector('.toasts') as HTMLElement;
    this.damageVignette = this.root.querySelector('[data-damage]') as HTMLElement;
    this.gasVignette = this.root.querySelector('[data-gasvig]') as HTMLElement;
    this.flash = this.root.querySelector('[data-flash]') as HTMLElement;
    this.fpsBadge = this.root.querySelector('[data-fps]') as HTMLElement;
    this.hitMarker = this.root.querySelector('[data-hitmarker]') as HTMLElement;
    this.targetName = this.root.querySelector('[data-target]') as HTMLElement;
    this.biomeChip = this.root.querySelector('[data-biome]') as HTMLElement;

    this.buildHotbar();
    this.buildCompass();
  }

  private contractProgressBar!: HTMLElement;

  private buildHotbar(): void {
    this.hotbar.innerHTML = '';
    this.slots = [];
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.innerHTML = `<span class="key">${i + 1}</span>`;
      slot.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.game.inventory.select(i);
        this.game.audio.ui();
      });
      this.hotbar.appendChild(slot);
      this.slots.push(slot);
    }
  }

  private buildCompass(): void {
    let html = '';
    for (let rep = -2; rep <= 2; rep++) {
      for (const [angle, label] of COMPASS_POINTS) {
        const isCardinal = label.length === 1;
        html += `<i class="${isCardinal ? 'card' : ''}" style="position:absolute;left:${(rep * 360 + angle) * 1.6}px">${label}</i>`;
      }
    }
    this.compassStrip.innerHTML = html;
  }

  notify(text: string, kind: 'good' | 'warn' | 'bad' | 'info' = 'info'): void {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toasts.appendChild(el);
    const timer = window.setTimeout(() => {
      el.classList.add('fade');
      window.setTimeout(() => el.remove(), 450);
    }, 2600);
    this.toastTimers.push(timer);
    if (this.toasts.children.length > 5) this.toasts.firstElementChild?.remove();
  }

  /** A short flash on the crosshair: the swing connected with something. */
  showHitMarker(kind: 'block' | 'mob' = 'block'): void {
    this.hitMarker.dataset.kind = kind;
    this.hitMarker.classList.remove('show');
    // Restart the animation.
    void this.hitMarker.offsetWidth;
    this.hitMarker.classList.add('show');
    this.hitTimer = 0.18;
  }

  flashDamage(): void {
    this.flash.style.transition = 'none';
    this.flash.style.opacity = '0.55';
    requestAnimationFrame(() => {
      this.flash.style.transition = 'opacity 0.35s ease';
      this.flash.style.opacity = '0';
    });
  }

  /** Write text only when it actually changed. */
  private setText(el: HTMLElement, key: string, value: string): void {
    if (this.domCache.get(key) === value) return;
    this.domCache.set(key, value);
    el.textContent = value;
  }

  /** Write a style only when it actually changed. */
  private setStyle(
    el: HTMLElement,
    key: string,
    prop: 'width' | 'opacity' | 'transform' | 'display',
    value: string,
  ): void {
    const cacheKey = `${key}.${prop}`;
    if (this.domCache.get(cacheKey) === value) return;
    this.domCache.set(cacheKey, value);
    el.style[prop] = value;
  }

  update(dt: number, fps: number): void {
    const game = this.game;
    const player = game.player;

    // --- vitals ---
    const hpRatio = Math.max(0, player.health / player.maxHealth);
    this.setStyle(this.healthBar, 'hp', 'width', `${hpRatio * 100}%`);
    this.setText(this.healthValue, 'hpv', `${Math.ceil(player.health)}`);
    this.setStyle(this.staminaBar, 'stamina', 'width', `${(player.stamina / PLAYER.maxStamina) * 100}%`);
    const airRatio = 1 - player.gas / 100;
    this.setStyle(this.gasBar, 'air', 'width', `${airRatio * 100}%`);
    this.setText(this.gasValue, 'airv', `${Math.round(airRatio * 100)}%`);
    this.setStyle(this.gasPill, 'gasPill', 'opacity', player.gas > 1 ? '1' : '0.45');

    // --- chips ---
    // innerHTML re-parses markup; these run every frame, so only the number
    // inside the chip is touched.
    this.setText(this.creditsValue, 'credits', game.credits.toLocaleString());
    const depth = Math.max(0, Math.round(game.surfaceHeight - player.pos.y));
    this.setText(this.depthValue, 'depth', `${depth}`);
    this.setText(this.clockChip, 'clock', game.clockString());

    // --- compass ---
    const yawDeg = ((-player.yaw * 180) / Math.PI + 360) % 360;
    this.setStyle(this.compassStrip, 'compass', 'transform', `translateX(${170 - yawDeg * 1.6}px)`);

    // --- crosshair + mining ring ---
    const mining = player.mineProgress > 0.001;
    this.crosshair.classList.toggle('mining', mining);
    this.setStyle(this.mineProgress, 'mineRing', 'display', mining ? 'block' : 'none');
    if (mining) {
      this.mineProgressCircle.style.strokeDashoffset = `${150 * (1 - Math.min(1, player.mineProgress))}`;
    }

    // --- hotbar ---
    if (game.inventory.selected !== this.lastSelected) {
      this.lastSelected = game.inventory.selected;
      const el = this.slots[this.lastSelected];
      if (el) {
        el.classList.remove('equip');
        // Restart the pop animation.
        void el.offsetWidth;
        el.classList.add('equip');
      }
    }
    const selected = game.inventory.getSelected();
    const selectedId = selected?.id ?? '';
    for (let i = 0; i < 9; i++) {
      const slot = game.inventory.slots[i];
      const el = this.slots[i];
      if (el.dataset.active !== String(i === game.inventory.selected)) {
        el.dataset.active = String(i === game.inventory.selected);
        el.classList.toggle('active', i === game.inventory.selected);
      }
      const key = slot ? `${slot.id}:${slot.count}:${slot.durability ?? ''}` : '';
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.innerHTML = `<span class="key">${i + 1}</span>`;
        if (slot) {
          const img = document.createElement('img');
          img.src = itemIcon(slot.id);
          img.alt = itemDef(slot.id).name;
          el.appendChild(img);
          if (slot.count > 1) {
            const count = document.createElement('span');
            count.className = 'count';
            count.textContent = `${slot.count}`;
            el.appendChild(count);
          }
          if (slot.durability !== undefined) {
            const bar = document.createElement('div');
            bar.className = 'durability';
            const max = itemDef(slot.id).tool?.durability ?? 1;
            const fill = document.createElement('i');
            fill.style.width = `${Math.max(0, (slot.durability / max) * 100)}%`;
            bar.appendChild(fill);
            el.appendChild(bar);
          }
        }
      }
    }
    if (selectedId !== this.lastHeldId) {
      this.lastHeldId = selectedId;
      if (selected) {
        this.heldName.textContent = itemDef(selected.id).name;
        this.heldName.classList.add('show');
        window.setTimeout(() => this.heldName.classList.remove('show'), 1600);
      } else {
        this.heldName.classList.remove('show');
      }
    }

    // --- robot panel ---
    const robot = game.robot;
    this.setText(this.robotState, 'robotState', robotStateLabel(robot.state));
    this.setStyle(this.robotBattery, 'robotBattery', 'width', `${(robot.battery / robot.batteryMax) * 100}%`);
    this.setText(this.robotCargo, 'robotCargo', `${robot.cargoCount} / ${robot.cargoLimit}`);
    this.setStyle(this.robotPanel, 'robotPanel', 'opacity', robot.state === 'OFFLINE' ? '0.55' : '1');

    // --- contract ---
    const quest = game.activeQuest;
    if (quest) {
      const progress = Math.min(quest.goal, game.stats.get(quest.stat));
      this.setText(this.contractName, 'questName', quest.name);
      this.setText(this.contractGoal, 'questGoal', quest.desc);
      this.setText(this.contractProgress, 'questProgress', `${progress}/${quest.goal}`);
      this.setStyle(this.contractProgressBar, 'questBar', 'width', `${(progress / quest.goal) * 100}%`);
      this.setStyle(this.contractPanel, 'questPanel', 'display', 'block');
    } else {
      this.setStyle(this.contractPanel, 'questPanel', 'display', 'none');
    }

    // --- the block under the crosshair ---
    const hovered = player.hoverBlock;
    if (hovered) {
      this.targetTimer = 1.6;
      this.setText(this.targetName, 'target', blockDef(hovered).name);
    } else if (this.targetTimer > 0) {
      this.targetTimer -= dt;
    }
    this.setStyle(this.targetName, 'targetOpacity', 'opacity', this.targetTimer > 0 ? '1' : '0');

    // --- where the miner is ---
    this.setText(
      this.biomeChip,
      'biome',
      biomeName(game.world?.terrain?.biomeMap, player.pos),
    );

    // --- vignettes ---
    this.setStyle(this.damageVignette, 'dmgVig', 'opacity', `${Math.max(0, 1 - hpRatio) * 0.9}`);
    this.damageVignette.classList.toggle('critical', hpRatio < 0.34 && hpRatio > 0);
    this.setStyle(this.gasVignette, 'gasVig', 'opacity', `${Math.max(0, (player.gas - 35) / 65) * 0.9}`);

    // --- hit marker ---
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.hitMarker.classList.remove('show');
    }

    // --- fps ---
    this.setText(this.fpsBadge, 'fps', `${Math.round(fps)} fps`);
    void dt;
  }
}
