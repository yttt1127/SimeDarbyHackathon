import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createApp } from '../apps/server/api';
import type { Snapshot } from '../packages/shared/types';

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
async function fixture() {
  const app = createApp(); apps.push(app);
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
    const alternatives = await (await fetch(f.base + `/api/alternatives?id=${request.id}`, { headers: { 'X-Session-Token': f.token } })).json();
    expect(alternatives[0].elevatorId).toBe('Lift A');
    expect((await f.post('reassign', { id: request.id, elevatorId: 'Lift A' })).status).toBe(200);
    const state = await (await fetch(f.base + '/api/state')).json() as Snapshot;
    expect(state.requests.find(r => r.id === request.id)!.assignedElevator).toBe('Lift A');
    expect(state.cars[1].stops.some(s => s.floor === 4)).toBe(false);
    expect((await f.post('control', { action: 'reset' })).status).toBe(200);
    expect(f.app.simulation.requests).toHaveLength(0);
  });
});
