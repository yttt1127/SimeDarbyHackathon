import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createApp } from '../apps/server/api';
import type { Snapshot } from '../packages/shared/types';
import { resolveRuntimeConfig, type RuntimeConfig } from '../apps/server/runtime';

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
async function fixture(runtime?: RuntimeConfig) {
  const app = createApp(undefined, runtime); apps.push(app);
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const token = (await (await fetch(`${base}/api/session`, { method: 'POST' })).json()).token as string;
  const post = async (path: string, data: unknown, session = token) => {
    const response = await fetch(base + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Token': session }, body: JSON.stringify(data) });
    return { status: response.status, body: await response.json() };
  };
  return { app, base, token, post, ws: `ws://127.0.0.1:${address.port}/ws` };
}
describe('M2/M5 · API integration', () => {
  it('creates immediately while paused and broadcasts scheduled traffic before resuming', async () => {
    const f = await fixture();
    const added = await f.post('passengers', { origin: 3, destination: 8, count: 2 });
    expect(added.body).toMatchObject({ created: 2, message: 'Added 2 passengers at floor 3.' });
    expect(f.app.simulation.running).toBe(false);
    expect(f.app.simulation.requests.filter(r => r.status === 'waiting')).toHaveLength(2);
    const socket = new WebSocket(f.ws);
    await new Promise<void>(resolve => socket.once('message', () => resolve()));
    const update = new Promise<Snapshot>(resolve => socket.once('message', data => resolve(JSON.parse(data.toString()))));
    const generated = await f.post('traffic', { count: 8, pattern: 'morning' });
    expect(generated.body).toMatchObject({ scheduled: 8, message: 'Scheduled 8 residential arrivals. Simulation running.' });
    expect(await update).toMatchObject({ pendingArrivals: 8, running: true });
    await f.post('control', { action: 'pause' });
    expect(f.app.simulation.snapshot().pendingArrivals).toBe(8);
    await f.post('control', { action: 'reset' });
    expect(f.app.simulation.snapshot()).toMatchObject({ pendingArrivals: 0, running: false, requests: [] });
    for (const data of [{ origin: 3, destination: 3, count: 2 }, { origin: 3, destination: 8, count: 101 }]) {
      const invalid = await f.post('passengers', data);
      expect(invalid.status).toBe(400);
      expect(invalid.body.error).toBeTruthy();
    }
    expect(f.app.simulation.requests).toHaveLength(0);
    expect((await f.post('traffic', { count: 0, pattern: 'morning' })).status).toBe(400);
    expect(f.app.simulation.running).toBe(false);
    socket.close();
  });
  it('broadcasts identical updates to two independent views and enforces ownership', async () => {
    const f = await fixture();
    const dashboard = new WebSocket(f.ws), passenger = new WebSocket(f.ws);
    const next = (socket: WebSocket) => new Promise<Snapshot>(resolve => socket.once('message', data => resolve(JSON.parse(data.toString()))));
    const initial = await Promise.all([next(dashboard), next(passenger)]);
    expect(initial[0]).toEqual(initial[1]);
    const updates = Promise.all([next(dashboard), next(passenger)]);
    const result = await f.post('request', { origin: 4, direction: 'UP' });
    expect(result.status).toBe(200);
    const frames = await updates;
    expect(frames[0]).toEqual(frames[1]);
    expect(frames[0].cars.flatMap(c => c.stops).flatMap(s => s.pickupIds)).toContain(result.body.id);
    const second = (await (await fetch(f.base + '/api/session', { method: 'POST' })).json()).token;
    expect((await f.post('cancel', { id: result.body.id }, second)).status).toBe(400);
    expect((await f.post('cancel', { id: result.body.id })).status).toBe(200);
    dashboard.close(); passenger.close();
  });
  it('validates payloads, boundary directions and configuration without corrupting state', async () => {
    const f = await fixture();
    expect((await f.post('request', { origin: 10, direction: 'UP' })).status).toBe(400);
    expect((await f.post('request', { origin: '3', direction: 'UP' })).status).toBe(400);
    expect((await f.post('control', { action: 'teleport' })).status).toBe(400);
    expect((await f.post('config', { floors: 0 })).status).toBe(400);
    expect(f.app.simulation.config.floors).toBe(10);
    expect(f.app.simulation.requests).toHaveLength(0);
    expect((await f.post('request', { origin: 3, direction: 'UP' }, 'fake')).status).toBe(401);
  });
  it('runs the complete capacity demonstration through HTTP commands', async () => {
    const f = await fixture();
    expect((await f.post('scenario', { name: 'capacity' })).status).toBe(200);
    const request = (await f.post('request', { origin: 4, direction: 'UP' })).body;
    expect(request.assignedElevator).toBe('Lift B');
    expect((await f.post('scenario', { name: 'surge' })).status).toBe(200);
    expect(f.app.simulation.events.some(e => e.type === 'bypass')).toBe(true);
    expect(f.app.simulation.events.some(e => e.type === 'reassignment' && e.requestId === request.id)).toBe(true);
    const state = await (await fetch(f.base + '/api/state')).json() as Snapshot;
    expect(state.requests.find(r => r.id === request.id)!.assignedElevator).toBe('Lift A');
    expect(state.cars[1].stops.some(s => s.floor === 4)).toBe(false);
    expect((await f.post('control', { action: 'reset' })).status).toBe(200);
    expect(f.app.simulation.requests).toHaveLength(0);
  });
  it('loads timed residential scenarios through the existing API', async () => {
    const f = await fixture();
    for (const name of ['morning', 'evening', 'off-peak', 'heavy']) {
      expect((await f.post('scenario', { name })).status).toBe(200);
      expect(f.app.simulation.requests).toHaveLength(0);
      f.app.simulation.advance(700);
      expect(f.app.simulation.requests).toHaveLength(name === 'heavy' ? 80 : 30);
      expect(f.app.simulation.requests.every(r => r.origin >= 1 && r.origin <= 10)).toBe(true);
    }
    expect((await f.post('traffic', { count: 5, pattern: 'invalid' })).status).toBe(400);
  });
  it('allows passwordless demo controls while preserving origin and session checks', async () => {
    const origin = 'https://liftflow.example.test';
    const runtime = resolveRuntimeConfig({ RENDER: 'true', RENDER_EXTERNAL_URL: origin });
    const f = await fixture(runtime);
    const browserPost = (path: string, data: unknown, token = f.token) => fetch(`${f.base}/api/${path}`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Session-Token': token }, body: JSON.stringify(data),
    });
    expect((await fetch(`${f.base}/api/state`, { headers: { Origin: origin } })).status).toBe(200);
    expect((await fetch(`${f.base}/api/state`, { headers: { Origin: 'https://other.example' } })).status).toBe(403);
    expect((await browserPost('control', { action: 'reset' })).status).toBe(200);
    expect((await browserPost('scenario', { name: 'capacity' })).status).toBe(200);
    expect((await browserPost('request', { origin: 4, direction: 'UP' })).status).toBe(200);
    expect((await browserPost('control', { action: 'reset' }, 'invalid')).status).toBe(401);
    expect((await browserPost('operator/login', { password: 'something' })).status).toBe(404);
    const connected = new WebSocket(f.ws, { origin });
    await new Promise<void>((resolve, reject) => { connected.once('open', resolve); connected.once('error', reject); });
    const next = new Promise<Snapshot>(resolve => connected.once('message', data => resolve(JSON.parse(data.toString()))));
    f.app.broadcast();
    expect((await next).cars).toHaveLength(2);
    connected.close();
    const rejected = new WebSocket(f.ws, { origin: 'https://other.example' });
    await new Promise<void>(resolve => rejected.once('error', resolve));
    expect(rejected.readyState).not.toBe(WebSocket.OPEN);
  });

});
