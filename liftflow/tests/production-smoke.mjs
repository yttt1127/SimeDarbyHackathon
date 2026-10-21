import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';

const origin = 'https://liftflow-smoke.example.test';
const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const { port } = socket.address();
await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'apps/server/index.ts'], {
  cwd: process.cwd(), env: { ...process.env, PORT: String(port), RENDER: 'true', RENDER_EXTERNAL_URL: origin,
    }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (condition, message) => { if (!condition) throw new Error(message); };

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited before listening: ${output}`);
    try { const response = await fetch(`${base}/api/state`, { headers: { Origin: origin } }); ready = response.ok; if (ready) break; }
    catch { /* waiting for startup */ }
    await sleep(100);
  }
  check(ready, `Production-style server did not bind to PORT=${port}: ${output}`);
  check(output.includes(`0.0.0.0:${port}`), 'Server did not bind to the configured public host and port');
  const html = await (await fetch(base, { headers: { Origin: origin } })).text();
  check(html.includes('Liftflow'), 'Dashboard route did not load');
  const passenger = await (await fetch(`${base}/passenger`, { headers: { Origin: origin } })).text();
  check(passenger.includes('Liftflow'), 'Passenger route did not load');
  for (const asset of [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1])) {
    check((await fetch(base + asset, { headers: { Origin: origin } })).ok, `Static asset failed: ${asset}`);
  }
  check(!(await fetch(`${base}/api/state`, { headers: { Origin: 'https://invalid.example.test' } })).ok, 'Invalid HTTP origin accepted');
  const session = await (await fetch(`${base}/api/session`, { method: 'POST', headers: { Origin: origin } })).json();
  check(typeof session.token === 'string', 'Session token is missing');
  const headers = { Origin: origin, 'Content-Type': 'application/json', 'X-Session-Token': session.token };
  const post = (route, body) => fetch(`${base}/api/${route}`, { method: 'POST', headers, body: JSON.stringify(body) });
  check((await post('control', { action: 'reset' })).ok, 'Demo control failed');
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const update = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No live dashboard update')), 4000);
    ws.on('message', data => {
      const state = JSON.parse(data.toString());
      if (state.requests.length) { clearTimeout(timeout); resolve(state); }
    });
  });
  check((await post('request', { origin: 4, direction: 'UP' })).ok, 'Passenger request failed');
  check((await update).cars.length === 2, 'Live state did not reach dashboard socket');
  ws.close();
  const rejected = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: 'https://invalid.example.test' });
  await new Promise(resolve => rejected.once('error', resolve));
  check((await post('operator/login', { password: 'unused' })).status === 404, 'Operator login should be removed');
  console.log('Production-style smoke passed: port, both pages, assets, state, WebSocket, passenger request, origin checks and passwordless controls.');
} finally {
  child.kill();
}
