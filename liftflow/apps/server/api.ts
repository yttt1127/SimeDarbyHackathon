import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { Simulation } from '../../packages/simulation/engine';
import type { Config } from '../../packages/shared/types';
import { checkOrigin, resolveRuntimeConfig, type RuntimeConfig } from './runtime';

export function createApp(initial = new Simulation(), runtime: RuntimeConfig = resolveRuntimeConfig(process.env)) {
  let simulation = initial;
  const sessions = new Map<string, string>();
  const sockets = new WebSocketServer({ noServer: true });
  const json = (response: ServerResponse, status: number, data: unknown) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(data));
  };
  async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
    let bytes = 0; const chunks: Buffer[] = [];
    for await (const chunk of request) {
      bytes += chunk.length; if (bytes > 16384) throw new Error('Request body too large');
      chunks.push(Buffer.from(chunk));
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object required');
    return value as Record<string, unknown>;
  }
  const numeric = (data: Record<string, unknown>, key: string) => {
    if (typeof data[key] !== 'number' || !Number.isFinite(data[key])) throw new Error(`${key} must be a finite number`);
    return data[key] as number;
  };
  const string = (data: Record<string, unknown>, key: string) => {
    if (typeof data[key] !== 'string' || !data[key]) throw new Error(`${key} must be a string`);
    return data[key] as string;
  };
  const broadcast = () => {
    const payload = JSON.stringify(simulation.snapshot());
    for (const client of sockets.clients) if (client.readyState === WebSocket.OPEN) {
      if (client.bufferedAmount > 1024 * 1024) { client.close(1013, 'Client too slow'); continue; }
      client.send(payload);
    }
  };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    try {
      if (!checkOrigin(request.headers.origin, runtime))
        return json(response, 403, { error: 'Origin not allowed' });
      if (request.method === 'GET' && url.pathname === '/api/state') return json(response, 200, simulation.snapshot());
      if (request.method === 'GET' && url.pathname === '/api/events') return json(response, 200, simulation.events);
      if (request.method === 'POST' && url.pathname === '/api/session') {
        const token = randomUUID(), sessionId = randomUUID();
        sessions.set(token, sessionId);
        return json(response, 200, { token, sessionId });
      }
      if (url.pathname.startsWith('/api/')) {
        const token = request.headers['x-session-token'];
        if (typeof token !== 'string' || !sessions.has(token)) return json(response, 401, { error: 'Session expired; reload the app' });
        const sessionId = sessions.get(token)!;
        if (request.method === 'GET' && url.pathname === '/api/alternatives') {
          return json(response, 200, simulation.alternatives(sessionId, url.searchParams.get('id') ?? ''));
        }
        if (request.method !== 'POST') return json(response, 404, { error: 'Route not found' });
        const data = await body(request);
        let result: unknown = { ok: true };
        switch (url.pathname) {
          case '/api/request': result = simulation.requestDirection(sessionId, numeric(data, 'origin'), string(data, 'direction')); break;
          case '/api/cancel': simulation.cancel(sessionId, string(data, 'id')); break;
          case '/api/reassign': simulation.reassign(sessionId, string(data, 'id'), string(data, 'elevatorId')); break;
          case '/api/passengers': {
            const count = data.count === undefined ? 1 : numeric(data, 'count');
            if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Count must be 1–100');
            const origin = numeric(data, 'origin'), destination = numeric(data, 'destination');
            for (let i = 0; i < count; i++) simulation.addPassenger('operator', origin, destination);
            result = { ok: true, created: count, message: `Added ${count} ${count === 1 ? 'passenger' : 'passengers'} at floor ${origin}.` };
            break;
          }
          case '/api/traffic': {
            const pattern = data.pattern ?? 'mixed';
            if (!['mixed', 'up-peak', 'morning', 'evening', 'off-peak', 'heavy'].includes(String(pattern))) throw new Error('Unknown traffic pattern');
            const count = numeric(data, 'count');
            simulation.generate(count, pattern as Parameters<Simulation['generate']>[1]);
            simulation.control('resume');
            result = { ok: true, scheduled: count, message: `Scheduled ${count} residential arrivals. Simulation running.` };
            break;
          }
          case '/api/control': {
            const action = string(data, 'action');
            if (!['start', 'pause', 'resume', 'reset', 'step'].includes(action)) throw new Error('Unknown action');
            simulation.control(action as 'start' | 'pause' | 'resume' | 'reset' | 'step', data.speed === undefined ? undefined : numeric(data, 'speed'));
            break;
          }
          case '/api/config': {
            const allowed = Object.keys(simulation.config);
            if (Object.keys(data).some(k => !allowed.includes(k))) throw new Error('Unknown configuration field');
            for (const key of Object.keys(data)) numeric(data, key);
            simulation = new Simulation({ ...simulation.config, ...data } as Config);
            break;
          }
          case '/api/scenario': {
            const name = string(data, 'name');
            if (name === 'capacity') {
              simulation = new Simulation();
              simulation.addPassenger('scenario', 1, 10); simulation.advance(2);
            } else if (name === 'surge') {
              if (simulation.running || simulation.now !== 2 || !simulation.requests.some(r => r.status === 'waiting' && r.origin === 4 && r.direction === 'UP' && r.assignedElevator === 'Lift B'))
                throw new Error('Load Capacity switch, request UP at floor 4 while paused, then add the surge');
              for (let i = 0; i < simulation.config.boardingLimit; i++) simulation.addPassenger('surge', 1, 10);
              simulation.advance(2);
            } else if (['morning', 'evening', 'off-peak', 'heavy', 'mixed'].includes(name)) {
              simulation.reset(); simulation.generate(name === 'heavy' ? 80 : 30, name as Parameters<Simulation['generate']>[1]);
            } else throw new Error('Unknown scenario');
            break;
          }
          default: return json(response, 404, { error: 'Route not found' });
        }
        broadcast(); return json(response, 200, result);
      }
      if (request.method !== 'GET') return json(response, 404, { error: 'Not found' });
      const root = resolve('dist');
      const path = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!path.startsWith(root + sep) && path !== root) return json(response, 403, { error: 'Invalid path' });
      const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
      let contents: Buffer; let extension = extname(path);
      try { contents = await readFile(path); }
      catch {
        if (extension) return json(response, 404, { error: 'File not found' });
        contents = await readFile(resolve(root, 'index.html')); extension = '.html';
      }
      response.writeHead(200, { 'Content-Type': mime[extension] ?? 'application/octet-stream' }); response.end(contents);
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : 'Invalid command' });
    }
  });
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/ws') return socket.destroy();
    if (!checkOrigin(request.headers.origin, runtime)) return socket.destroy();
    sockets.handleUpgrade(request, socket, head, client => {
      client.send(JSON.stringify(simulation.snapshot()));
    });
  });
  let previous = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    const elapsed = Math.min(1, (now - previous) / 1000); previous = now;
    if (simulation.running) { simulation.tick(elapsed); broadcast(); }
  }, 100);
  timer.unref();
  return { server, get simulation() { return simulation; }, broadcast,
    close: async () => {
      clearInterval(timer);
      for (const client of sockets.clients) client.terminate();
      sockets.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}
