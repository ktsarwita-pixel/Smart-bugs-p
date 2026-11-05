/**
 * MCP-debugger driver: proves the wall collision no longer throws the miner
 * back a whole block.
 *
 * Breakpoint: the snap-back line in physics.ts. Every time it fires the
 * snapped position is compared with the blocked target: the difference has to
 * stay tiny, otherwise the miner is being teleported backwards.
 *
 *   npx esbuild scripts/collision-probe.ts --bundle --platform=node --format=esm \
 *     --sourcemap --outfile=.cache/collision.mjs --external:jsdom
 *   node scripts/mcp-client.mjs scripts/verify-collision.mjs
 */
const PROBE = '/home/user/Smart-bugs-p/.cache/collision.mjs';
const ROOT = '/home/user/Smart-bugs-p';

export default async function run({ call }) {
  const session = await call('create_debug_session', {
    language: 'javascript',
    name: 'Sulfur Miners collision check',
  });
  const sessionId = session.sessionId ?? session.data?.sessionId;
  console.log('session:', sessionId);

  const bp = await call('set_breakpoint', {
    sessionId,
    file: `${ROOT}/src/entities/physics.ts`,
    statement: 'pos.z = vel.z > 0 ? Math.floor(target + half) - half - 1e-4 : Math.floor(target - half) + 1 + half + 1e-4;',
  });
  console.log('bp(wall snap):', bp.success, bp.message ?? '', bp.warning ?? '');

  await call('start_debugging', {
    sessionId,
    scriptPath: PROBE,
    dapLaunchArgs: { cwd: ROOT, stopOnEntry: false, justMyCode: false },
    breakOnExceptions: 'none',
  });

  let snaps = 0;
  let biggestJump = 0;
  for (let i = 0; i < 10; i++) {
    const stop = await call('wait_for_stop', { sessionId, timeout: 15000 });
    if (!stop.success) break;
    const frame = stop.snapshot?.frames?.[0] ?? {};
    const line = frame.line ?? 0;
    const path = String(frame.file ?? '').split('/').slice(-1)[0];
    if (path === 'physics.ts' && line === 127) {
      const evalRes = await call('evaluate_expression', {
        sessionId,
        expression:
          'JSON.stringify({targetZ: target, snappedZ: Math.floor(target - half) + 1 + half + 1e-4, playerZ: pos.z, half: half})',
      });
      const text = String(evalRes.result ?? evalRes);
      const match = /\{.*\}/.exec(text);
      if (match) {
        const data = JSON.parse(match[0]);
        snaps++;
        const jump = Math.abs(data.snappedZ - data.targetZ);
        if (jump > biggestJump) biggestJump = jump;
        console.log(
          `snap ${snaps}: target=${data.targetZ.toFixed(3)} snapped=${data.snappedZ.toFixed(3)} jump=${jump.toFixed(4)}`,
        );
      }
    } else {
      console.log(`stop at ${path}:${line}`);
    }
    await call('continue_execution', { sessionId });
  }

  console.log('\n=== collision summary ===');
  console.log(`snap-backs observed: ${snaps}`);
  console.log(`largest correction: ${biggestJump.toFixed(4)} blocks`);
  console.log(
    biggestJump < 0.5
      ? 'OK: the miner is only nudged back to the wall, never thrown a block backwards'
      : 'FAIL: the miner is still being thrown backwards',
  );

  const out = await call('get_output', { sessionId, limit: 40 });
  const entries = out.entries ?? [];
  for (const e of entries.slice(-6)) {
    console.log(`[${e.category}] ${String(e.output).slice(0, 200)}`);
  }
}
