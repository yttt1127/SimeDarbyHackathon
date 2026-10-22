import { describe, it, expect } from 'vitest';
import { Simulation } from '../packages/simulation/engine';
import { CapacityAssignment } from '../packages/scheduling/assignment';
import { forecast } from '../packages/prediction/forecast';
import { collective } from '../packages/scheduling/collective';
import { MockCamera } from '../packages/sensors/mock-camera';

describe('M3/M4 · observations, forecasts and recommendations', () => {
  it('hides waiting destinations and future movements from prediction DTOs', () => {
    const a = new Simulation({ elevators: 1 }), b = new Simulation({ elevators: 1 });
    a.addPassenger('a', 3, 5); b.addPassenger('a', 3, 10);
    expect(a.knowledge()).toEqual(b.knowledge());
    expect(a.snapshot().cars[0].stops).toEqual(b.snapshot().cars[0].stops);
    expect(JSON.stringify(a.knowledge())).not.toContain('destination');
    a.advance(10); b.advance(10);
    expect(a.knowledge().cars[0].calls[0].floor).toBe(5);
    expect(b.knowledge().cars[0].calls[0].floor).toBe(10);
  });
  it('updates current observed and predicted occupancy after boarding and exiting', () => {
    const sim = new Simulation({ elevators: 1 });
    sim.addPassenger('a', 1, 4);
    expect(sim.snapshot().cars[0].observation.count).toBe(0);
    sim.advance(2);
    const stop = sim.snapshot().cars[0].stops.find(s => s.floor === 4)!;
    expect(stop.arriving).toBe(1); expect(stop.exits).toBe(1); expect(stop.after).toBe(0);
    expect(sim.snapshot().cars[0].observation.count).toBe(1);
    expect(sim.snapshot().cars[0].stops[0].pickupIds).toEqual(['R1']);
    expect(sim.snapshot().cars[0].stops[0].boarding).toBe(0);
    sim.advance(20);
    expect(sim.snapshot().cars[0].observation.count).toBe(0);
  });
  it('propagates sensor uncertainty and conserves occupancy across all planned stops', () => {
    const sim = new Simulation({ sensorError: 2, elevators: 1 });
    sim.addPassenger('a', 3, 8); sim.addPassenger('b', 6, 9);
    const k = sim.knowledge(); k.cars[0].observation = { count: 9, timestamp: 0, uncertainty: 2 };
    const stops = forecast(k.cars[0], collective.plan(k.cars[0], k.requests), k);
    expect(stops[0].availability).toBe('Uncertain');
    expect(stops[1].arriving).toBe(stops[0].after);
    for (const stop of stops) {
      expect(stop.after).toBe(stop.arriving - stop.exits + stop.boarding);
      expect(stop.spaces).toBe(Math.max(0, sim.config.comfort - stop.beforeBoarding));
    }
    const sensor = new MockCamera(2, 42);
    expect(sensor.observe({ now: 7, cars: { A: 5 }, lobbies: { 1: 3 } })).toEqual(sensor.observe({ now: 7, cars: { A: 5 }, lobbies: { 1: 3 } }));
  });
  it('prefers earlier service when capacity does not justify a delay', () => {
    const sim = new Simulation();
    sim.cars[1].position = 8;
    const candidates = new CapacityAssignment().candidates(sim.knowledge(), { id: 'trial', origin: 2, direction: 'UP', assignedElevator: '' });
    expect(candidates[0].elevatorId).toBe('Lift A');
    expect(candidates[0].risk).toBe(0);
  });
  it('retains explicit alternatives under uncertain observations without aggressive bypass', () => {
    const sim = new Simulation({ sensorError: 0.1 });
    sim.addPassenger('scenario', 1, 10); sim.advance(2);
    const request = sim.addPassenger('visitor', 4, 9);
    expect(request.assignedElevator).toBe('Lift B');
    expect(sim.alternatives('visitor', request.id)).toHaveLength(0);
    for (let i = 0; i < 10; i++) sim.addPassenger('surge', 1, 10);
    sim.advance(2);
    expect(sim.cars[1].onboard).toHaveLength(10);
    const alternatives = sim.alternatives('visitor', request.id);
    expect(alternatives[0].elevatorId).toBe('Lift A');
    const old = sim.snapshot().cars[1].stops;
    expect(old.find(s => s.floor === 4)!.availability).toBe('Likely full');
    sim.reassign('visitor', request.id, alternatives[0].elevatorId);
    expect(sim.requests.find(r => r.id === request.id)!.assignedElevator).toBe('Lift A');
    expect(sim.snapshot().cars[1].stops.some(s => s.floor === 4)).toBe(false);
    expect(sim.snapshot().cars[1].stops.some(s => s.floor === 10 && s.dropoffIds.length === 10)).toBe(true);
    expect(sim.events.some(e => e.type === 'stop-removal')).toBe(true);
    sim.advance(100);
    expect(sim.requests.every(r => r.status === 'completed')).toBe(true);
  });
  it('preserves another passenger pickup when an alternative is accepted under uncertainty', () => {
    const sim = new Simulation({ sensorError: 0.1 });
    sim.addPassenger('scenario', 1, 10); sim.advance(2);
    const first = sim.addPassenger('visitor', 4, 9);
    const other = sim.addPassenger('other', 4, 8);
    expect(other.assignedElevator).toBe('Lift B');
    for (let i = 0; i < 10; i++) sim.addPassenger('surge', 1, 10);
    sim.advance(2); sim.reassign('visitor', first.id, 'Lift A');
    expect(sim.snapshot().cars[1].stops.find(s => s.floor === 4)!.pickupIds).toContain(other.id);
  });
});
