import { itemIcon } from '../render/textures';
import { itemDef } from '../game/items';
import { allRecipes, type Recipe } from '../game/recipes';
import { UPGRADES } from '../game/upgrades';
import { RENDER } from '../core/constants';
import { QUESTS } from '../game/quests';
import type { Game } from '../game/game';

type TabId = 'inventory' | 'crafting' | 'upgrades' | 'market' | 'stats' | 'settings' | 'help';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'inventory', label: 'Pack' },
  { id: 'crafting', label: 'Craft' },
  { id: 'upgrades', label: 'Upgrades' },
  { id: 'market', label: 'Market' },
  { id: 'stats', label: 'Stats' },
  { id: 'settings', label: 'Settings' },
  { id: 'help', label: 'Help' },
];

/** Modal screens: pack, crafting, upgrades, market, stats, settings, help. */
export class Screens {
  readonly root: HTMLDivElement;
  private body: HTMLElement;
  private title: HTMLElement;
  private tabBar: HTMLElement;
  private active: TabId | null = null;
  private craftFilter = 'all';

  constructor(private readonly game: Game) {
    this.root = document.createElement('div');
    this.root.className = 'screen hidden';
    this.root.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h2 data-title>Sulfur Miners</h2>
          <div class="tabs" data-tabs></div>
          <button class="btn small" data-close>Close ✕</button>
        </div>
        <div data-body></div>
      </div>
    `;
    this.body = this.root.querySelector('[data-body]') as HTMLElement;
    this.title = this.root.querySelector('[data-title]') as HTMLElement;
    this.tabBar = this.root.querySelector('[data-tabs]') as HTMLElement;

    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    this.root.querySelector('[data-close]')?.addEventListener('click', () => this.close());

    for (const tab of TABS) {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.textContent = tab.label;
      btn.dataset.tab = tab.id;
      btn.addEventListener('click', () => this.open(tab.id));
      this.tabBar.appendChild(btn);
    }
  }

  get isOpen(): boolean {
    return this.active !== null;
  }

  open(tab: TabId): void {
    this.active = tab;
    this.root.classList.remove('hidden');
    for (const el of Array.from(this.tabBar.children) as HTMLElement[]) {
      el.classList.toggle('active', el.dataset.tab === tab);
    }
    this.render();
    this.game.audio.ui();
    this.game.onScreenOpened();
  }

  close(): void {
    this.active = null;
    this.root.classList.add('hidden');
    this.game.onScreenClosed();
  }

  toggle(tab: TabId): void {
    if (this.active === tab) this.close();
    else this.open(tab);
  }

  render(): void {
    if (!this.active) return;
    switch (this.active) {
      case 'inventory':
        this.title.textContent = 'Miner Pack';
        this.renderInventory();
        break;
      case 'crafting':
        this.title.textContent = 'Fabrication Bench';
        this.renderCrafting();
        break;
      case 'upgrades':
        this.title.textContent = 'Company Upgrades';
        this.renderUpgrades();
        break;
      case 'market':
        this.title.textContent = 'Ore Market';
        this.renderMarket();
        break;
      case 'stats':
        this.title.textContent = 'Shift Report';
        this.renderStats();
        break;
      case 'settings':
        this.title.textContent = 'Settings';
        this.renderSettings();
        break;
      case 'help':
        this.title.textContent = 'Field Manual';
        this.renderHelp();
        break;
    }
  }

  /* ------------------------------------------------------------------ */

  private renderInventory(): void {
    const inv = this.game.inventory;
    const slots: string[] = [];
    for (let i = 0; i < inv.slots.length; i++) {
      const slot = inv.slots[i];
      if (!slot) {
        slots.push(`<div class="slot" data-slot="${i}"></div>`);
        continue;
      }
      const def = itemDef(slot.id);
      slots.push(`
        <div class="slot" data-slot="${i}" title="${def.name}">
          <img src="${itemIcon(slot.id)}" alt="${def.name}">
          ${slot.count > 1 ? `<span class="count">${slot.count}</span>` : ''}
        </div>
      `);
    }

    const gear = inv.gear;
    this.body.innerHTML = `
      <div class="panel-head" style="border:none;margin-bottom:8px">
        <h3 style="margin:0;font-size:14px;letter-spacing:2px;color:var(--accent-2)">UTILITY SLOT</h3>
      </div>
      <div class="grid" style="grid-template-columns:repeat(1,minmax(52px,1fr));max-width:70px">
        ${
          gear
            ? `<div class="slot" data-gear="1" title="${itemDef(gear.id).name}">
                 <img src="${itemIcon(gear.id)}" alt="${itemDef(gear.id).name}">
               </div>`
            : '<div class="slot" data-gear="1" style="opacity:.4"></div>'
        }
      </div>
      <p style="color:var(--ink-dim);font-size:11.5px;margin:8px 0 16px">
        Click a mask, lantern, scanner, backpack or thruster in the pack to wear it.
      </p>
      <div class="grid" data-pack>${slots.join('')}</div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="btn small" data-action="sort">Sort pack</button>
        <button class="btn small" data-action="drop-garbage">Drop junk</button>
      </div>
    `;

    this.body.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
      el.addEventListener('click', () => {
        const index = Number(el.dataset.slot);
        const slot = inv.slots[index];
        if (!slot) return;
        const def = itemDef(slot.id);
        if (def.gear) {
          const previous = inv.gear;
          inv.gear = { id: slot.id, count: 1 };
          inv.slots[index] = previous;
          this.game.applyGear();
          this.game.notify(`Equipped ${def.name}.`, 'good');
          this.render();
        }
      });
    });

    this.body.querySelector('[data-action="sort"]')?.addEventListener('click', () => {
      this.game.sortInventory();
      this.render();
    });
    this.body.querySelector('[data-action="drop-garbage"]')?.addEventListener('click', () => {
      this.game.dropJunk();
      this.render();
    });
  }

  private renderCrafting(): void {
    const recipes = allRecipes();
    const filters = ['all', 'tools', 'blocks', 'materials', 'gear'];
    const filterButtons = filters
      .map(
        (f) =>
          `<button class="tab ${this.craftFilter === f ? 'active' : ''}" data-filter="${f}">${f}</button>`,
      )
      .join('');

    const visible = recipes.filter((r) => {
      if (this.craftFilter === 'all') return true;
      const def = itemDef(r.output.item);
      if (this.craftFilter === 'tools') return !!def.tool;
      if (this.craftFilter === 'blocks') return def.place !== undefined;
      if (this.craftFilter === 'gear') return !!def.gear;
      return !def.tool && def.place === undefined && !def.gear;
    });

    const cards = visible
      .map((r) => {
        const hasSmelter = this.game.nearSmelter;
        const stationOk = r.station !== 'smelter' || hasSmelter;
        const canCraft = stationOk && r.ingredients.every((ing) => this.game.inventory.has(ing.item, ing.count));
        const ingredients = r.ingredients
          .map((ing) => {
            const have = this.game.inventory.count(ing.item);
            const ok = have >= ing.count;
            return `<span class="${ok ? 'need ok' : 'need'}" title="${itemDef(ing.item).name}">
              ${itemDef(ing.item).name} ${have}/${ing.count}
            </span>`;
          })
          .join(' · ');

        return `
          <div class="recipe">
            <div class="out"><img src="${itemIcon(r.output.item)}" alt=""></div>
            <div class="info">
              <strong>${itemDef(r.output.item).name}${r.output.count > 1 ? ` ×${r.output.count}` : ''}</strong>
              <small>${r.desc}</small>
              <small>${ingredients}</small>
              ${
                r.station === 'smelter' && !hasSmelter
                  ? '<small style="color:var(--danger)">Requires a Smelter within 4 blocks</small>'
                  : ''
              }
            </div>
            <button class="btn small" data-craft="${r.id}" ${canCraft ? '' : 'disabled'}>Craft</button>
          </div>
        `;
      })
      .join('');

    this.body.innerHTML = `
      <div class="tabs" style="margin-bottom:10px">${filterButtons}</div>
      <div class="recipe-list">${cards || '<div class="empty-note">No recipes here yet.</div>'}</div>
    `;

    this.body.querySelectorAll<HTMLElement>('[data-filter]').forEach((el) => {
      el.addEventListener('click', () => {
        this.craftFilter = el.dataset.filter ?? 'all';
        this.render();
      });
    });
    this.body.querySelectorAll<HTMLElement>('[data-craft]').forEach((el) => {
      el.addEventListener('click', () => {
        const recipe = recipes.find((r) => r.id === el.dataset.craft);
        if (recipe && this.game.craft(recipe)) {
          this.render();
        }
      });
    });
  }

  private renderUpgrades(): void {
    const game = this.game;
    const cards = UPGRADES.map((u) => {
      const owned = game.hasUpgrade(u.id);
      const reqOk = !u.requires || u.requires.every((r) => game.inventory.has(r.item, r.count));
      const affordable = game.credits >= u.cost;
      const canBuy = !owned && reqOk && affordable;
      const reqText = u.requires
        ? u.requires
            .map((r) => `${itemDef(r.item).name} (${game.inventory.count(r.item)}/${r.count})`)
            .join(', ')
        : '';
      return `
        <div class="upgrade ${owned ? 'owned' : ''}">
          <h5>${u.name}</h5>
          <p>${u.desc}</p>
          ${
            owned
              ? '<div class="price-row"><span class="need ok">Installed</span></div>'
              : `<div class="price-row">
                   <span>${u.cost} credits</span>
                   <button class="btn small" data-buy="${u.id}" ${canBuy ? '' : 'disabled'}>
                     ${!reqOk ? 'Missing parts' : affordable ? 'Buy' : 'Too expensive'}
                   </button>
                 </div>
                 ${reqText ? `<div class="price-row" style="margin-top:6px;color:var(--ink-dim);font-size:11px">Requires ${reqText}</div>` : ''}`
          }
        </div>
      `;
    }).join('');

    this.body.innerHTML = `<div class="upgrade-grid">${cards}</div>`;
    this.body.querySelectorAll<HTMLElement>('[data-buy]').forEach((el) => {
      el.addEventListener('click', () => {
        if (this.game.buyUpgrade(el.dataset.buy ?? '')) this.render();
      });
    });
  }

  private renderMarket(): void {
    const inv = this.game.inventory;
    const sellable = new Map<string, number>();
    for (const slot of inv.slots) {
      if (!slot) continue;
      const def = itemDef(slot.id);
      if (def.value <= 0) continue;
      if (def.place !== undefined) continue;
      sellable.set(slot.id, (sellable.get(slot.id) ?? 0) + slot.count);
    }

    const rows = [...sellable.entries()]
      .map(([id, count]) => {
        const def = itemDef(id);
        const total = count * def.value;
        return `
          <div class="item-card">
            <img src="${itemIcon(id)}" alt="">
            <div class="meta">
              <strong>${def.name} ×${count}</strong>
              <small>${def.desc}</small>
            </div>
            <div class="cost">${total} cr</div>
            <button class="btn small" data-sell="${id}">Sell</button>
          </div>
        `;
      })
      .join('');

    this.body.innerHTML = `
      <p style="color:var(--ink-dim);font-size:12px;margin:0 0 12px">
        Sell raw materials for credits. Credits buy company upgrades.
      </p>
      ${rows || '<div class="empty-note">Nothing sellable yet — mine some ore first.</div>'}
    `;
    this.body.querySelectorAll<HTMLElement>('[data-sell]').forEach((el) => {
      el.addEventListener('click', () => {
        this.game.sellItem(el.dataset.sell ?? '');
        this.render();
      });
    });
  }

  private renderStats(): void {
    const stats = this.game.stats;
    const quests = QUESTS.map((q) => {
      const progress = Math.min(q.goal, stats.get(q.stat));
      const done = progress >= q.goal;
      return `
        <div class="item-card ${done ? '' : 'locked'}">
          <div class="meta">
            <strong>${q.name} ${done ? '✔' : ''}</strong>
            <small>${q.desc}</small>
          </div>
          <div class="cost">${progress}/${q.goal}</div>
          <div class="cost">+${q.reward} cr</div>
        </div>
      `;
    }).join('');

    const mined = Object.entries(stats.mined)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count]) => `<div><span>${itemDef(id).name}</span><span>${count}</span></div>`)
      .join('');

    this.body.innerHTML = `
      <div class="panel-head" style="border:none">
        <h3 style="margin:0;font-size:14px;letter-spacing:2px;color:var(--accent)">CONTRACTS</h3>
      </div>
      ${quests}
      <div class="panel-head" style="border:none;margin-top:16px">
        <h3 style="margin:0;font-size:14px;letter-spacing:2px;color:var(--accent)">SHIFT RECORD</h3>
      </div>
      <div class="stat-list">
        <div><span>Blocks mined</span><span>${stats.blocksMined}</span></div>
        <div><span>Blocks placed</span><span>${stats.blocksPlaced}</span></div>
        <div><span>Deepest shaft</span><span>${stats.depthReached} m</span></div>
        <div><span>Robot blocks</span><span>${stats.robotBlocks}</span></div>
        <div><span>Cargo delivered</span><span>${stats.robotCargo}</span></div>
        <div><span>Ingots smelted</span><span>${stats.smelted}</span></div>
        <div><span>Credits earned</span><span>${stats.creditsEarned}</span></div>
        <div><span>Creatures defeated</span><span>${stats.hostilesDefeated}</span></div>
        <div><span>Deaths</span><span>${stats.deaths}</span></div>
      </div>
      <div class="panel-head" style="border:none;margin-top:16px">
        <h3 style="margin:0;font-size:14px;letter-spacing:2px;color:var(--accent)">MATERIALS MINED</h3>
      </div>
      <div class="stat-list">${mined || '<div><span>Nothing yet</span><span>0</span></div>'}</div>
    `;
  }

  private renderSettings(): void {
    const s = this.game.settings;
    this.body.innerHTML = `
      <div class="setting-row">
        <span>Look sensitivity</span>
        <input type="range" min="0.3" max="2.5" step="0.05" value="${s.sensitivity}" data-setting="sensitivity">
      </div>
      <div class="setting-row">
        <span>Field of view</span>
        <input type="range" min="60" max="110" step="1" value="${s.fov}" data-setting="fov">
      </div>
      <div class="setting-row">
        <span>Master volume</span>
        <input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-setting="volume">
      </div>
      <div class="setting-row">
        <span>Render distance (chunks)</span>
        <input type="range" min="3" max="${RENDER.maxRenderDistance}" step="1" value="${s.renderDistance}" data-setting="renderDistance">
      </div>
      <div class="setting-row">
        <span>Invert vertical look</span>
        <input type="checkbox" ${s.invertY ? 'checked' : ''} data-setting="invertY">
      </div>
      <div class="setting-row">
        <span>Touch controls</span>
        <input type="checkbox" ${s.touchControls ? 'checked' : ''} data-setting="touchControls">
      </div>
      <div class="setting-row">
        <span>Show FPS</span>
        <input type="checkbox" ${s.showFps ? 'checked' : ''} data-setting="showFps">
      </div>
      <div class="setting-row">
        <span>Music & ambience</span>
        <input type="checkbox" ${s.ambience ? 'checked' : ''} data-setting="ambience">
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="btn" data-action="save">Save game</button>
        <button class="btn danger" data-action="reset">New world</button>
      </div>
    `;

    this.body.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.setting as keyof typeof s;
        if (input.type === 'checkbox') {
          (s[key] as boolean) = input.checked;
        } else {
          (s[key] as number) = Number(input.value);
        }
        this.game.applySettings();
      });
    });
    this.body.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      this.game.saveGame();
    });
    this.body.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      if (confirm('Start a brand new world? Your current progress will be lost.')) {
        this.game.resetWorld();
      }
    });
  }

  private renderHelp(): void {
    const key = (k: string): string => `<span class="keycap">${k}</span>`;
    this.body.innerHTML = `
      <div class="keys-grid">
        <div>${key('W')}${key('A')}${key('S')}${key('D')} Move</div>
        <div>${key('Space')} Jump / swim up</div>
        <div>${key('Shift')} Sprint</div>
        <div>${key('Ctrl')} Crouch</div>
        <div>${key('LMB')} Mine / attack</div>
        <div>${key('RMB')} Place block / use</div>
        <div>${key('1')}-${key('9')} Select hotbar slot</div>
        <div>${key('E')} Pack</div>
        <div>${key('C')} Fabrication bench</div>
        <div>${key('U')} Upgrades</div>
        <div>${key('M')} Market</div>
        <div>${key('G')} BOLT-7 scanner ping</div>
        <div>${key('R')} Recall BOLT-7</div>
        <div>${key('T')} Toggle BOLT-7 work mode</div>
        <div>${key('F')} Toggle lantern</div>
        <div>${key('V')} First / third person</div>
        <div>${key('Esc')} Pause menu</div>
      </div>
      <h3 style="margin-top:18px;font-size:14px;letter-spacing:2px;color:var(--accent)">TOUCH CONTROLS</h3>
      <div class="keys-grid">
        <div>Left stick — walk</div>
        <div>Drag on the right — look around</div>
        <div>⛏ button — mine / attack</div>
        <div>▣ button — place block</div>
        <div>▲ button — jump</div>
        <div>» button — sprint toggle</div>
        <div>Tap a hotbar slot to select</div>
      </div>
      <h3 style="margin-top:18px;font-size:14px;letter-spacing:2px;color:var(--accent)">HOW TO PLAY</h3>
      <p style="color:var(--ink-dim);font-size:12.5px;line-height:1.7">
        You are a sulfur miner with a robot partner, BOLT-7. Dig down, gather brimstone,
        iron, gold and diamonds, then sell your haul at the surface market to buy company
        upgrades. Watch your air supply in sulfur clouds, keep BOLT-7 charged, and never
        dig straight down without a plan — the deep is dark and full of cave dwellers.
      </p>
    `;
  }
}

export type { Recipe };
