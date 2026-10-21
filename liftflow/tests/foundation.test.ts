import { describe, it, expect } from 'vitest';
import { Simulation } from '../packages/simulation/engine';
import { collective } from '../packages/scheduling/collective';
import type { KnownCar } from '../packages/shared/types';

describe('M1 · simulation foundation', () => {
  it('moves continuously on the same clock as every stop ETA', () => {
    const sim = new Simulation({ elevators: 1 });
    sim.addPassenger('one', 3, 7);
    expect(sim.snapshot().cars[0].stops[0].eta).toBe(8);
    sim.advance(4);
    expect(sim.cars[0].position).toBe(2);
    expect(sim.snapshot().cars[0].stops[0].eta).toBe(4);
    sim.advance(4);
    expect(sim.cars[0].phase).toBe('OPENING');
    sim.advance(2);
    expect(sim.snapshot().passengers[0].status).toBe('boarding');
    expect(sim.snapshot().cars[0].stops.map(s => s.floor)).toEqual([3, 7]);
    expect(sim.snapshot().cars[0].stops[1].eta).toBe(22);
    sim.advance(22);
    expect(sim.cars[0].phase).toBe('OPENING');
    expect(sim.cars[0].position).toBe(7);
    sim.advance(8);
    expect(sim.snapshot().passengers[0].status).toBe('completed');
    expect(sim.cars[0].phase).toBe('IDLE');
  });
  it('serves compatible stops before reversing and represents repeat floors', () => {
    const car: KnownCar = { id: 'A', position: 3, direction: 'UP', phase: 'IDLE', phaseEnd: Infinity,
      calls: [{ passengerId: 'p', floor: 7 }], observation: { count: 1, timestamp: 0, uncertainty: 0 } };
    const route = collective.plan(car, [
      { id: 'up', origin: 5, direction: 'UP', assignedElevator: 'A' },
      { id: 'down', origin: 5, direction: 'DOWN', assignedElevator: 'A' },
      { id: 'low', origin: 2, direction: 'DOWN', assignedElevator: 'A' },
    ]);
    expect(route.map(s => s.floor)).toEqual([5, 7, 5, 2]);
    expect(route[2].pickupIds).toEqual(['down']);
    expect(route[1].dropoffIds).toEqual(['p']);
  });
  it('cancels only the owner request, preserving a shared pickup', () => {
    const sim = new Simulation({ elevators: 1 });
    const a = sim.addPassenger('a', 5, 8), b = sim.addPassenger('b', 5, 9);
    expect(() => sim.cancel('b', a.id)).toThrow('belong');
    sim.cancel('a', a.id);
    expect(sim.snapshot().cars[0].stops[0].pickupIds).toEqual([b.id]);
    sim.cancel('b', b.id);
    expect(sim.snapshot().cars[0].stops).toEqual([]);
    expect(sim.events.some(e => e.type === 'stop-removal')).toBe(true);
  });
  it('rejects changing committed requests and onboard destinations', () => {
    const sim = new Simulation({ elevators: 1 });
    const a = sim.addPassenger('a', 3, 8);
    sim.advance(1);
    expect(() => sim.cancel('a', a.id)).toThrow('committed');
    sim.advance(9);
    expect(() => sim.cancel('a', a.id)).toThrow('waiting');
    expect(sim.snapshot().cars[0].stops.some(s => s.floor === 8 && s.dropoffIds.length === 1)).toBe(true);
  });
  it('enforces the boarding limit and eventually serves passengers left waiting', () => {
    const sim = new Simulation({ elevators: 1, boardingLimit: 2, comfort: 2 });
    for (let i = 0; i < 5; i++) sim.addPassenger(`s${i}`, 1, 5);
    sim.advance(2);
    expect(sim.cars[0].onboard.length).toBe(2);
    expect(sim.requests.filter(r => r.status === 'waiting')).toHaveLength(3);
    expect(sim.events.filter(e => e.type === 'failed-boarding')).toHaveLength(3);
    for (let i = 0; i < 200; i++) {
      sim.advance(1);
      expect(sim.cars[0].onboard.length).toBeLessThanOrEqual(2);
    }
    expect(sim.requests.every(r => r.status === 'completed')).toBe(true);
  });
  it('pause, step and reset are authoritative', () => {
    const sim = new Simulation(); sim.addPassenger('a', 4, 8);
    sim.tick(2); expect(sim.now).toBe(0);
    sim.control('start', 2); sim.tick(2); expect(sim.now).toBe(4);
    sim.control('pause'); sim.tick(5); expect(sim.now).toBe(4);
    sim.control('step'); expect(sim.now).toBe(5); expect(sim.running).toBe(false);
    sim.control('reset'); expect(sim.now).toBe(0); expect(sim.requests).toHaveLength(0);
    expect(sim.cars.every(c => c.position === 1 && c.phase === 'IDLE')).toBe(true);
  });
  it('is reproducible with a fixed seed and scenario', () => {
    const a = new Simulation(), b = new Simulation();
    a.generate(20); b.generate(20); a.advance(120); b.advance(120);
    expect(a.snapshot()).toEqual(b.snapshot());
  });
  it('retains drop-offs when a cancellable hall request at that floor is removed', () => {
    const sim = new Simulation({ elevators: 1 });
    sim.addPassenger('rider', 1, 8); sim.advance(2);
    const hall = sim.addPassenger('hall', 8, 10); sim.cancel('hall', hall.id);
    const stop = sim.snapshot().cars[0].stops.find(s => s.floor === 8)!;
    expect(stop.dropoffIds).toHaveLength(1); expect(stop.pickupIds).toHaveLength(0);
  });
  it('does not duplicate a deferred pickup once the return trip is committed', () => {
    const sim = new Simulation({ elevators: 1, comfort: 1, boardingLimit: 1 });
    sim.addPassenger('a', 1, 3); const second = sim.addPassenger('b', 1, 4);
    sim.advance(25);
    expect(sim.cars[0].phase).toBe('MOVING');
    expect(sim.snapshot().cars[0].stops.filter(s => s.pickupIds.includes(second.id))).toHaveLength(1);
    expect(sim.snapshot().cars[0].stops[0].pickupIds).toContain(second.id);
  });
  it('preserves lifecycle and capacity invariants through varied deterministic traffic', () => {
    for (const seed of [1, 7, 19, 42, 103]) {
      const sim = new Simulation({ seed, comfort: 3, boardingLimit: 3 });
      sim.generate(25);
      for (let step = 0; step < 180; step++) {
        sim.advance(5);
        const state = sim.snapshot();
        for (const car of state.cars) {
          expect(car.position).toBeGreaterThanOrEqual(1);
          expect(car.position).toBeLessThanOrEqual(10);
          expect(car.actualOccupancy).toBeLessThanOrEqual(3);
          expect(car.stops.every((s, i, stops) => s.eta >= 0 && (!i || s.eta >= stops[i - 1].eta))).toBe(true);
        }
        expect(new Set(sim.cars.flatMap(c => c.onboard)).size).toBe(sim.cars.reduce((n, c) => n + c.onboard.length, 0));
      }
      expect(sim.requests.every(r => r.status === 'completed')).toBe(true);
      expect(sim.snapshot().passengers.every(p => p.status === 'completed')).toBe(true);
    }
  });
});
