# ⛏️ Sulfur Miners v2 — Deep Shaft Edition

A **Minecraft-style voxel mining game** that runs in the browser. You are a sulfur miner
working the volcanic **Sulfur Basin**, and you are not alone down there: **BOLT-7**, your
robot miner companion, drills veins, hauls loot and needs charging.

> 🎮 Live build: **[sulfur-miners-v2.vercel.app](https://sulfur-miners-v2.vercel.app)**

---

## ✨ Features

### The world
- **Voxel terrain** (128 × 128 × 96) generated from a single seed — mountains, ash
  badlands, volcanic calderas, pine ridges, caves, lava lakes and ore veins.
- **Flood-filled lighting**: sky light + block light, smooth per-vertex shading with
  ambient occlusion, torches, lava and crystals that actually light the shaft.
- **Day/night cycle** with a shader sky, sun, moon, stars and drifting fog.
- A hand-built **company shaft** at spawn: lit tunnels, plank supports, a smelter,
  a charge station and beacons — your base for the whole run.
- Playable caves, water, lava, sulfur vents, glowing fungus and crystal shards.

### You
- First-person mining with a full survival loop: **health, stamina, air/filtration,
  fall damage, drowning-free swimming, sprinting, crouching, step-up climbing**.
- Tool tiers gate the ores: wood → stone → iron → steel → **sulfur drill**.
- **Sulfur gas** builds up around brimstone; equip a **gas mask** or take damage.
- Third-person toggle (`V`) shows your blocky miner with a walk cycle.

### BOLT-7 (the robot miner)
- Follows you, **autonomously locates and drills ore veins**, stores the haul in its
  cargo bay and delivers it to your pack.
- Battery drains while drilling, recharges on a **charge station** or while idling.
- **Scanner ping** (`G`) reveals ore veins through the rock (shown on the minimap).
- **Recall** (`R`) with the Beacon Link upgrade, work/free toggle (`T`), and a
  cargo limit that grows with upgrades.

### The business
- 12 **contracts** (mine X sulfur, reach depth 70, smelt 5 ingots…) that pay credits.
- An **ore market** to sell raw materials, and **13 company upgrades** to buy.
- Crafting bench with 30+ recipes (tools, machines, gear, smelting).
- Cave dwellers and magmites that hunt in the dark — fight them with a sword.
- Full **stats & shift report** screen, achievements-style progress tracking.

### Mobile
- Virtual **joystick**, drag-to-look, jump / mine / place / sprint buttons.
- Responsive HUD, safe-area insets, orientation hint, adaptive pixel ratio.
- Tap hotbar slots, and every screen is built for thumbs.

### Under the hood
- **Zero external assets** — every texture, icon and sound is generated in code
  (pixel-art atlas + Web Audio synthesis).
- Saves to `localStorage`; worlds are reproducible via `?seed=12345`.
- Custom voxel shader packs sky/block light + AO into the vertex stream, so the
  day/night cycle animates without re-meshing.

---

## 🎮 Controls

| Desktop | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| `Space` | Jump / swim up |
| `Shift` | Sprint |
| `Ctrl` | Crouch |
| Left mouse | Mine / attack |
| Right mouse | Place block / use machine |
| `1`–`9`, `Q` | Hotbar |
| `E` / `C` / `U` / `M` | Pack / Crafting / Upgrades / Market |
| `G` / `R` / `T` | BOLT-7 scan / recall / work mode |
| `F` / `V` / `P` / `Esc` | Lantern / view / save / pause |

**Touch**: left stick to walk, drag the right side to look, ⛏ to mine, ▣ to place,
▲ to jump, » to sprint, ☰ for the menu.

---

## 🛠 Development

```bash
npm install
npm run dev        # dev server on http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm test           # typecheck + engine, UI and end-to-end suites
npm run verify     # tests + build
```

### Test suites

| Command | What it covers |
| --- | --- |
| `npm run test:unit` | World generation, lighting engine, ray casting, chunk meshing, inventory, recipe/item integrity, quest + upgrade data, save/replay of world edits, determinism |
| `npm run test:ui` | Procedural texture atlas, item icons, HUD, every modal screen, touch controls (jsdom) |
| `npm run test:e2e` | Boots the real game headlessly: mining, drops, placement, crafting, market, upgrades, contracts, robot mining + delivery, survival, death/respawn, save system |

---

## 🏗 Architecture

```
src/
├── core/        constants, seeded noise & RNG, input, procedural audio, storage
├── world/       block registry, texture tiles, terrain generation, voxel store,
│                lighting engine, chunk mesher (AO + smooth light)
├── render/      procedural texture atlas & icons, voxel/sky shaders, particles
├── entities/    player, BOLT-7 robot, cave dwellers, dropped items, models, physics
├── game/        inventory, items, recipes, upgrades, contracts, stats, main Game
└── ui/          HUD, screens, minimap, touch controls
```

Rendering uses Three.js with a custom `ShaderMaterial`: the vertex stream carries
`alight = (blockLight, skyLight, shade × AO)` and the fragment shader combines it with a
global day factor, atlas texture and fog — one draw call per chunk, no light maps.

---

## 📜 License

MIT — do what you like with it, but go dig some sulfur.
