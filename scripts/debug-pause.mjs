/**
 * MCP-debugger driver: launches the game harness under the debugger, lets it
 * run, then pauses it and reports where the time is going.
 *
 *   node scripts/mcp-client.mjs scripts/debug-pause.mjs
 */
const HARNESS = '/home/user/Smart-bugs-p/node_modules/.cache/harness.mjs';

export default async function run({ call, tools }) {
  const names = tools.map((t) => t.name);
  console.log('available tools:', names.join(', '));

  const session = await call('create_debug_session', {
    language: 'javascript',
    name: 'Sulfur Miners harness',
  });
  const sessionId = session.sessionId ?? session.data?.sessionId;
  console.log('session:', sessionId);

  const start = await call('start_debugging', {
    sessionId,
    scriptPath: HARNESS,
    dapLaunchArgs: {
      cwd: '/home/user/Smart-bugs-p',
      env: { NODE_OPTIONS: '' },
      stopOnEntry: false,
      justMyCode: true,
    },
    breakOnExceptions: 'all',
  });
  console.log('start:', JSON.stringify(start).slice(0, 600));

  // Let the game run for a few seconds.
  await new Promise((r) => setTimeout(r, 8000));

  const paused = await call('pause_execution', { sessionId });
  console.log('pause:', JSON.stringify(paused).slice(0, 1500));

  const stack = await call('get_stack_trace', { sessionId });
  console.log('stack:', JSON.stringify(stack).slice(0, 3000));

  const locals = await call('get_local_variables', { sessionId });
  console.log('locals:', JSON.stringify(locals).slice(0, 2000));

  const out = await call('get_output', { sessionId, limit: 60 });
  console.log('output:', JSON.stringify(out).slice(0, 3000));
}
