/**
 * MCP-debugger driver: proves the fall-death loop at spawn.
 *
 * Breakpoints:
 *   1. the fall-damage branch in player.ts  -> how far did we fall?
 *   2. the death handler in game.ts         -> the player died again
 *
 *   node scripts/mcp-client.mjs scripts/debug-falldamage.mjs
 */
const HARNESS = '/home/user/Smart-bugs-p/node_modules/.cache/harness.mjs';
const ROOT = '/home/user/Smart-bugs-p';

export default async function run({ call }) {
  const session = await call('create_debug_session', {
    language: 'javascript',
    name: 'Sulfur Miners fall damage',
  });
  const sessionId = session.sessionId ?? session.data?.sessionId;
  console.log('session:', sessionId);

  const bpFall = await call('set_breakpoint', {
    sessionId,
    file: `${ROOT}/src/entities/player.ts`,
    statement: "if (dmg > 0) this.damage(dmg, 'the fall');",
  });
  console.log('bp(fall):', bpFall.success, bpFall.message, bpFall.warning ?? '');

  const bpDeath = await call('set_breakpoint', {
    sessionId,
    file: `${ROOT}/src/game/game.ts`,
    statement: 'this.hud?.notify(`Respawning at the company shaft… (${cause})`, \'bad\');',
  });
  console.log('bp(death):', bpDeath.success, bpDeath.message, bpDeath.warning ?? '');

  await call('start_debugging', {
    sessionId,
    scriptPath: HARNESS,
    dapLaunchArgs: { cwd: ROOT, stopOnEntry: false, justMyCode: true },
    breakOnExceptions: 'none',
  });

  // Collect stops for a while.
  for (let i = 0; i < 6; i++) {
    const stop = await call('wait_for_stop', { sessionId, timeout: 20000 });
    if (!stop.success) {
      console.log('stop failed:', JSON.stringify(stop).slice(0, 400));
      break;
    }
    console.log(`\n--- stop ${i + 1} ---`);
    console.log('location:', JSON.stringify(stop.location));
    console.log('reason:', stop.data?.reason ?? stop.reason);
    const locals = await call('get_local_variables', { sessionId });
    console.log('locals:', JSON.stringify(locals.variables ?? locals).slice(0, 900));
    const evalRes = await call('evaluate_expression', {
      sessionId,
      expression: 'JSON.stringify({y: this.game?.player?.pos?.y, fall: this.fallDistance, hp: this.game?.player?.health})',
    });
    console.log('eval:', JSON.stringify(evalRes).slice(0, 500));
    await call('continue_execution', { sessionId });
  }

  const out = await call('get_output', { sessionId, limit: 40 });
  const entries = out.entries ?? [];
  for (const e of entries.slice(-20)) {
    console.log(`[${e.category}] ${String(e.output).slice(0, 220)}`);
  }
}
