#!/usr/bin/env node
/**
 * Minimal MCP stdio client for driving the mcp-debugger server.
 *
 * Usage:
 *   node scripts/mcp-client.mjs <script.mjs>
 *
 * The script file default-exports an async function that receives an object
 * with `call(tool, args)` and `tools` (the tool list). It runs against a live
 * debug session so the agent can set breakpoints, inspect variables and read
 * the debuggee output.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SERVER = '/home/user/_mcpdbg/node_modules/@debugmcp/mcp-debugger/dist/cli.mjs';

function createClient() {
  const child = spawn('node', [SERVER, 'stdio', '--log-level', 'error'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let nextId = 1;
  const pending = new Map();
  let buffer = '';

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code ?? ''})`));
        else resolve(msg.result);
      }
    }
  });
  child.stderr.on('data', (c) => {
    const text = c.toString().trim();
    if (text) process.stderr.write(`[mcp-debugger] ${text}\n`);
  });

  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`timeout waiting for ${method}`));
        }
      }, 120000);
    });

  const notify = (method, params) =>
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);

  return {
    async init() {
      const res = await send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'arena-debug-client', version: '1.0.0' },
      });
      notify('notifications/initialized', {});
      return res;
    },
    async listTools() {
      const res = await send('tools/list', {});
      return res.tools ?? [];
    },
    async call(tool, args) {
      const res = await send('tools/call', { name: tool, arguments: args });
      const text = (res.content ?? [])
        .map((c) => (c.type === 'text' ? c.text : JSON.stringify(c)))
        .join('\n');
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
      return { isError: res.isError, data: parsed, text };
    },
    close() {
      child.kill();
    },
  };
}

const scriptPath = process.argv[2];
const client = createClient();
await client.init();
const tools = await client.listTools();
const run = (await import(scriptPath.startsWith('/') ? scriptPath : `${process.cwd()}/${scriptPath}`)).default;
try {
  await run({
    tools,
    call: async (tool, args) => {
      const res = await client.call(tool, args);
      if (res.isError) throw new Error(`${tool} failed: ${JSON.stringify(res.data).slice(0, 2000)}`);
      return res.data;
    },
    raw: (tool, args) => client.call(tool, args),
  });
} finally {
  client.close();
}
void readFileSync;
