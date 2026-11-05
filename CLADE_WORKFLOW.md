---
# Run-contract schema version. Only version 1 is currently supported.
version: 1
# Maximum workers that may run concurrently.
max_concurrency: 4
# Classified-failure retry policy (max_attempts includes the first attempt).
retry:
  enabled: true
  max_attempts: 3
# Declared exponential-backoff policy for run schedulers.
backoff:
  initial_seconds: 2
  max_seconds: 30
  multiplier: 2
# A loop converges after convergence_n iterations with <= convergence_k changes.
convergence_k: 2
convergence_n: 3
max_iterations: 20
# Commands that must pass before the run is considered verified.
verify_commands:
  - npm run typecheck
  - npm run test:unit
  - npm run test:ui
  - npm run test:e2e
  - npm run test:physics
  - npm run build
# required = oracle gate; advisory = review without a hard gate; disabled = no oracle/review.
oracle_posture: required
# Whether successful, approved work may be merged automatically.
auto_merge: false
---

This file is the single source of truth for this deployment's autonomous-run
policy. Review it like code and commit it, so each run can record the exact Git
blob SHA of the policy it used.

## What the commands mean

| Command | Gate |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` — no type errors anywhere. |
| `npm run test:unit` | Headless engine suite: world generation, lighting, ray casting, meshing, inventory, recipe/quest/upgrade data integrity, save + world-edit replay, determinism. |
| `npm run test:ui` | jsdom suite: procedural texture atlas, item icons, HUD, every modal screen, touch controls. |
| `npm run test:e2e` | Boots the real `Game` headlessly: mining, drops, placement, crafting, market, upgrades, contracts, robot mining + delivery, survival, death/respawn, save system. |
| `npm run test:physics` | Spawn safety, landing resolution, void recovery and fall damage. These are the regressions that made the game unplayable, so they stay covered. |
| `npm run build` | `tsc --noEmit && vite build` — the exact artifact Vercel deploys. |

`npm run verify` runs all of the above in order and is the single command a
human or an agent should run before delivering.

## Failure policy

- A failing command is retried up to **3** times with **2 s → 4 s → 30 s**
  backoff — this absorbs flaky infrastructure (registry hiccups, cold builds).
- A command that still fails after the retries is a **real** failure: fix the
  code, do not lower the bar (no skipped suites, no `|| true`, no weakening of
  assertions).
- Blockers outside the repository (credentials, network policy, a repository
  rename that needs account-admin rights) are **parked and reported** in the
  delivery notes, never silently skipped.

## Merge policy

`oracle_posture: required` — a reviewable, verified result is mandatory.
`auto_merge: false` — a human performs the merge.
