/**
 * MCP-debugger driver: verifies the fixes for the death loop, the embedded
 * landing and the void fall.
 *
 * Breakpoints:
 *   1. game.ts   — the spawn call            (must be hit, on solid ground)
 *   2. physics.ts — the landing resolution   (must be hit, on top of a block)
 *   3. player.ts — the fall damage           (must NOT be hit at spawn)
 *   4. player.ts — the void recovery         (must NOT be hit)
 *
 *   node scripts/mcp-client.mjs scripts/verify-fixes.mjs
 */
// The harness must live outside node_modules: with justMyCode on, js-debug
// blackboxes everything under node_modules and no breakpoint ever fires.
const HARNESS = '/home/user/Smart-bugs-p/.cache/harness.mjs';
const ROOT = '/home/user/Smart-bugs-p';

export default async function run({ call }) {
  const session = await call('create_debug_session', {
    language: 'javascript',
    name: 'Sulfur Miners fix verification',
  });
  const sessionId = session.sessionId ?? session.data?.sessionId;
  console.log('session:', sessionId);

  const bpSpawn = await call('set_breakpoint', {
    sessionId,
    file: `${ROOT}/src/game/game.ts`,
    statement: 'this.player.spawnAt(spawn.x, spawn.y, spawn.z);',
  });
  console.log('bp(spawn):', bpSpawn.success, bpSpawn.message ?? '', bpSpawn.warning ?? '');

  const bpLand = await call('set_breakpoint', {
    sessionId,
    file: `${ROOT}/src/entities/physics.ts`,
    statement: 'pos.y = Math.floor(pos.y) + 1 + 1e-4;',
  });
  console.log('bp(landing):', bpLand.success, bpLand.message ?? '', bpLand.warning ?? '');

  const bpFall = await call('set_breakpoint', {
    sessionId,
    file: `${ROOT}/src/entities/player.ts`,
    statement: "if (dmg > 0) this.damage(dmg, 'the fall');",
  });
  console.log('bp(fall damage):', bpFall.success, bpFall.message ?? '', bpFall.warning ?? '');

  const bpVoid = await call('set_breakpoint', {
    sessionId,
    file: `${ROOT}/src/entities/player.ts`,
    statement: 'this.recoverFromVoid();',
  });
  console.log('bp(void recovery):', bpVoid.success, bpVoid.message ?? '', bpVoid.warning ?? '');

  await call('start_debugging', {
    sessionId,
    scriptPath: HARNESS,
    dapLaunchArgs: { cwd: ROOT, stopOnEntry: false, justMyCode: false },
    breakOnExceptions: 'none',
  });

  const hits = { spawn: 0, landing: 0, fall: 0, void: 0 };
  for (let i = 0; i < 12; i++) {
    const stop = await call('wait_for_stop', { sessionId, timeout: 12000 });
    if (!stop.success) {
      console.log('\nno further stops — the run finished without hitting the bad breakpoints');
      break;
    }
    const frame = stop.snapshot?.frames?.[0] ?? {};
    const line = frame.line ?? 0;
    const path = String(frame.file ?? '').split('/').slice(-2).join('/');
    let kind = 'other';
    if (path.includes('game.ts') && line === 293) kind = 'spawn';
    else if (path.includes('physics.ts') && line === 138) kind = 'landing';
    else if (path.includes('player.ts') && line === 281) kind = 'FALL-DAMAGE';
    else if (path.includes('player.ts') && line === 172) kind = 'VOID-RECOVERY';
    hits[kind] = (hits[kind] ?? 0) + 1;
    console.log(`\n--- stop ${i + 1} @ ${path}:${line} (${kind}) ---`);
    if (stop.snapshot?.locals) {
      const locals = stop.snapshot.locals;
      const keep = Object.fromEntries(
        Object.entries(locals).filter(([k]) =>
          ['spawn', 'pos', 'dy', 'result', 'this', 'fallDistance', 'dmg'].includes(k),
        ),
      );
      console.log('locals:', JSON.stringify(keep).slice(0, 500));
    }

    if (kind === 'spawn') {
      const evalRes = await call('evaluate_expression', {
        sessionId,
        expression:
          'JSON.stringify({spawn: spawn, groundBelow: world.isSolidAt(Math.floor(spawn.x), Math.floor(spawn.y) - 1, Math.floor(spawn.z)), headroom: world.isSolidAt(Math.floor(spawn.x), Math.floor(spawn.y) + 1, Math.floor(spawn.z))})',
      });
      console.log('eval:', JSON.stringify(evalRes).slice(0, 700));
    }
    if (kind === 'landing') {
      const evalRes = await call('evaluate_expression', {
        sessionId,
        expression:
          'JSON.stringify({feetBefore: pos.y, blockUnderFeet: world.getBlock(Math.floor(pos.x), Math.floor(pos.y) - 1, Math.floor(pos.z)), feetWillBe: Math.floor(pos.y) + 1})',
      });
      console.log('eval:', JSON.stringify(evalRes).slice(0, 700));
    }
    await call('continue_execution', { sessionId });
  }

  console.log('\n=== stop summary ===');
  console.log(JSON.stringify(hits, null, 2));
  console.log(
    hits['FALL-DAMAGE']
      ? 'FAIL: the miner still takes fall damage'
      : 'OK: the miner never takes fall damage',
  );
  console.log(
    hits['VOID-RECOVERY']
      ? 'FAIL: the miner still falls out of the world'
      : 'OK: the miner never falls out of the world',
  );
  console.log(hits.spawn > 0 ? 'OK: the spawn was reached' : 'FAIL: the spawn was never reached');
  console.log(
    hits.landing > 0
      ? 'OK: the landing resolution was reached (the miner stands on the block)'
      : 'FAIL: no landing',
  );

  const out = await call('get_output', { sessionId, limit: 60 });
  const entries = out.entries ?? [];
  for (const e of entries.slice(-12)) {
    console.log(`[${e.category}] ${String(e.output).slice(0, 240)}`);
  }
}
