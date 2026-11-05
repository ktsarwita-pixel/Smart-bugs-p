# AGENTS.md — instructions for AI coding agents

**Sulfur Miners v2** is a browser game: a Minecraft-style voxel mining world with a
robot miner companion (BOLT-7). Vite + TypeScript + Three.js, zero external art
assets — every texture, icon and sound is generated in code.

## Commands

| Task | Command |
| --- | --- |
| Dev server (0.0.0.0:5173) | `npm run dev` |
| Type check only | `npm run typecheck` |
| Production build | `npm run build` (runs `tsc --noEmit && vite build`) |
| Serve the production build | `npm run preview` |
| Engine tests | `npm run test:unit` |
| UI tests (jsdom) | `npm run test:ui` |
| End-to-end game tests | `npm run test:e2e` |
| Physics / spawn regression tests | `npm run test:physics` |
| Everything | `npm run verify` |

`npm run verify` is the gate — **no change is delivered until it is green.**

## Layout

```
src/core/      constants, seeded RNG/noise, input, procedural audio
src/world/     block registry, tiles, terrain gen, voxel store + lighting, mesher
src/render/    procedural texture atlas, voxel/sky shaders, particles
src/entities/  player, BOLT-7 robot, mobs, dropped items, models, physics
src/game/      items, recipes, upgrades, contracts, inventory, the Game orchestrator
src/ui/        HUD, screens, minimap, touch controls
scripts/       headless test suites (node, no browser required)
```

## Conventions

- **Strict TypeScript.** No `any` in new code; `npx tsc --noEmit` must stay clean.
- **Registries are data.** New blocks go in `src/world/blocks.ts`, new items in
  `src/game/items.ts`, recipes in `src/game/recipes.ts`, upgrades in
  `src/game/upgrades.ts`, contracts in `src/game/quests.ts`. Never inline content
  in the `Game` orchestrator.
- **Every item needs an icon.** Item icons are generated procedurally in
  `src/render/textures.ts`; a new item without an icon renders as a blank slot.
- **Blocks need a drop.** `Block` entries carry `drop`, `light`, `render`,
  `hazard` and `value`; `ITEM_TO_BLOCK` links an item id to the block it places.
- **Lighting is incremental.** `World.setBlock` must keep the light channels
  consistent (remove → reseed → `spreadLight`); a block placed by hand that does
  not reseed will leak light or leave a black hole.
- **Chunk rebuilds are budgeted.** Mesh building happens through
  `nextDirtyChunk()` inside a ~7 ms per-frame budget so mining never stutters.
- **Comments explain *why*, not *what*.** Keep them short.

## Adding content — checklist

1. Block/item/recipe/upgrade/contract entry in its registry.
2. Icon painter in `src/render/textures.ts` if it is an item.
3. A test in the matching `scripts/*-test.ts` suite (data integrity + behaviour).
4. `npm run verify` green before committing.

## Delivery workflow (Clade run contract)

The autonomous-run policy for this repository lives in `CLADE_WORKFLOW.md` and is
reviewed like code:

1. **Plan** — write down the change and how it will be verified.
2. **Change** — keep the diff scoped to the plan; park unrelated work.
3. **Verify** — run `npm run verify` (typecheck + 3 suites + production build).
   Retry a failing command up to 3 times with 2 s → 4 s → 30 s backoff before
   treating it as a real failure.
4. **Commit** — one focused commit, then push the branch and open a PR.
   Merges are always a human decision (`auto_merge: false`).

Blockers that cannot be resolved inside a run (for example a credential that
needs to be reconnected) are parked and reported, never silently skipped.

<!-- sense:start -->
## Use the Sense index for codebase understanding

Sense gives you structural understanding of the codebase (symbols, relationships, patterns) without reading dozens of files. Prefer it over grep, glob, and file-walking for any structural or semantic question.

| Question | Tool |
|---|---|
| Who calls X? What does X call? | sense_graph |
| Who holds/embeds X? Which structs carry it (directly or via a field)? | sense_graph (composed_by) |
| What retains X transitively, incl. behind interface-typed fields (lifecycle audit)? | sense_blast (retained_via_interfaces) |
| Find code related to a concept | sense_search |
| What breaks if I change X? | sense_blast |
| What patterns does this project follow? | sense_conventions |
| Index health, what's indexed | sense_status |

**You MUST NOT** use grep/glob for symbol lookup, or skip Sense because its tools load on demand. **About to grep, rg, or find (including through Bash) to locate code?** Searching for a *name* (a function, method, type, or constant; who calls it; what it touches) is a Sense call first: sense_graph, sense_search, or sense_blast. Searching for a *literal* (an error string, log line, config key, TODO), grep is right, go ahead. One line: **grepping a name → Sense; grepping a string → grep.** For list outputs (dead code, blast radius, callers), spot-check a sample with grep before relying on them.

**Cite from what Sense returns; don't re-open a file to recover a line it already gave you.** Sense results already carry exact locations: every symbol has a *ref* (file:line) and graph/blast call sites include their own line. Those are authoritative, citable file:line — use them directly. After a sense_blast/sense_graph you already hold the dependent list *with* locations; cite it, don't re-derive the same list by reading every file. Open a file only when you need its **content** (a method body to describe behaviour), never just to re-confirm a location Sense already pinned. Let Sense **replace** the exploration, not sit on top of it.

**When NOT to use Sense** (use grep instead): exact text/string search, reading file contents, editing code (Sense is read-only).
<!-- sense:end -->
