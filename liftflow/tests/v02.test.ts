import { describe, it, expect } from 'vitest';
import { Simulation } from '../packages/simulation/engine';
import { defaults } from '../packages/shared/types';
import { MockCamera } from '../packages/sensors/mock-camera';
import { reachedFloor } from '../apps/web/src/passenger-format';

describe('V0.2 coordinated residential service', () => {
  it('F: displayed floors never imply reaching a floor early in either direction', () => {
    expect(reachedFloor({ position: 5.9, direction: 'UP', phase: 'MOVING' })).toBe(5);
    expect(reachedFloor({ position: 5.1, direction: 'DOWN', phase: 'MOVING' })).toBe(6);
    expect(reachedFloor({ position: 5, direction: 'DOWN', phase: 'MOVING' })).toBe(5);
  });
  it('residential percentages are configurable and two-floor buildings remain valid', () => {
    const sim = new Simulation({ morningLobbyShare: 1, floors: 2 });
    sim.generate(10, 'morning'); sim.advance(300);
    expect(sim.requests).toHaveLength(10);
    expect(sim.requests.every(r => r.origin === 2 && r.direction === 'DOWN')).toBe(true);
    sim.reset(); sim.generate(10, 'off-peak'); sim.advance(300);
    expect(sim.requests.every(r => r.status === 'completed')).toBe(true);
    expect(() => new Simulation({ eveningLobbyShare: 1.1 })).toThrow('Invalid');
  });
  it('A: consolidates six separately assigned DOWN requests into one visit, preserving identities', () => {
    const sim = new Simulation();
    for (let i = 0; i < 6; i++) sim.addPassenger(`owner-${i}`, 7, 1);
    // Model previously split demand, including requests assigned before coordination.
    sim.requests.forEach((r, i) => { r.assignedElevator = i % 2 ? 'Lift B' : 'Lift A'; });
    sim.advance(200);
    expect(sim.requests).toHaveLength(6);
    expect(sim.requests.every(r => r.status === 'completed' && r.assignedElevator === 'Lift A')).toBe(true);
    expect(sim.events.filter(e => e.type === 'arrival' && e.message.includes('floor 7'))).toHaveLength(1);
    expect(sim.events.filter(e => e.type === 'boarding')).toHaveLength(6);
    expect(new Set(sim.requests.map(r => r.sessionId)).size).toBe(6);
  });
  it('splits excess hall demand when a single car cannot board everyone', () => {
    const sim = new Simulation({ boardingLimit: 3, comfort: 2 });
    for (let i = 0; i < 8; i++) sim.addPassenger(`owner-${i}`, 7, 1);
    sim.advance(600);
    expect(sim.requests.every(r => r.status === 'completed')).toBe(true);
    expect(new Set(sim.events.filter(e => e.type === 'boarding').map(e => e.requestId)).size).toBe(8);
    expect(new Set(sim.requests.map(r => r.assignedElevator)).size).toBe(2);
  });
  it('B: bypasses a full pickup-only stop and serves it after the mandatory destination', () => {
    const sim = new Simulation({ elevators: 1, boardingLimit: 2, comfort: 1 });
    sim.addPassenger('a', 1, 10); sim.addPassenger('b', 1, 10); sim.advance(2);
    const waiting = sim.addPassenger('c', 8, 9);
    sim.advance(0);
    expect(sim.events.some(e => e.type === 'bypass' && e.requestId === waiting.id)).toBe(true);
    expect(sim.snapshot().cars[0].stops.filter(s => !s.serviced).map(s => s.floor)).toEqual([10, 8]);
    expect(sim.requests.find(r => r.id === waiting.id)!.status).toBe('waiting');
    sim.advance(200);
    expect(sim.requests.every(r => r.status === 'completed')).toBe(true);
    expect(sim.events.filter(e => e.type === 'arrival').map(e => e.message)).toEqual([
      'Lift A arrived at floor 1', 'Lift A arrived at floor 10', 'Lift A arrived at floor 8', 'Lift A arrived at floor 9',
    ]);
  });
  it('C/D: never bypasses drop-offs and serves an intermediate pickup after exits', () => {
    const sim = new Simulation({ elevators: 1, boardingLimit: 2, comfort: 1 });
    sim.addPassenger('a', 1, 8); sim.addPassenger('b', 1, 10); sim.advance(2);
    const sameFloor = sim.addPassenger('c', 8, 9);
    const later = sim.addPassenger('d', 9, 10);
    sim.advance(200);
    expect(sim.events.some(e => e.type === 'bypass' && e.requestId === sameFloor.id)).toBe(false);
    expect(sim.requests.find(r => r.id === later.id)!.status).toBe('completed');
    expect(sim.events.filter(e => e.type === 'arrival').map(e => e.message)).toEqual([
      'Lift A arrived at floor 1', 'Lift A arrived at floor 8', 'Lift A arrived at floor 9', 'Lift A arrived at floor 10',
    ]);
  });
  it('does not bypass based on comfort alone or uncertain observations', () => {
    for (const uncertainty of [0, 0.1]) {
      const sim = new Simulation({ elevators: 1, boardingLimit: uncertainty ? 1 : 2, comfort: 1, sensorError: uncertainty });
      sim.addPassenger('a', 1, 10); sim.advance(2);
      sim.addPassenger('b', 8, 9); sim.advance(0);
      expect(sim.events.filter(e => e.type === 'bypass')).toHaveLength(0);
      expect(sim.snapshot().cars[0].stops.filter(s => !s.serviced)[0].floor).toBe(8);
    }
  });
  it('never interrupts a committed pickup when occupancy observations change', () => {
    let observedFull = false;
    const camera = new MockCamera();
    const sim = new Simulation({ elevators: 1, boardingLimit: 1 }, undefined, {
      observe(counts) {
        const frame = camera.observe(counts);
        if (observedFull) frame.cars['Lift A'].count = 1;
        return frame;
      },
    });
    const r = sim.addPassenger('owner', 8, 10); sim.advance(1);
    observedFull = true;
    const before = structuredClone(sim.cars[0].committed);
    expect(() => sim.cancel('owner', r.id)).toThrow('committed');
    sim.advance(1);
    expect(sim.cars[0].committed).toEqual(before);
    expect(sim.events.filter(e => e.type === 'bypass')).toHaveLength(0);
  });
  it('forecast uses known exits and hard boarding slots independently of comfort', () => {
    const sim = new Simulation({ elevators: 1, comfort: 1, boardingLimit: 3 });
    for (let i = 0; i < 3; i++) sim.addPassenger('r', 1, 8);
    const stop = sim.snapshot().cars[0].stops[0];
    expect(stop.spaces).toBe(3); expect(stop.boardingSpaces).toBe(3); expect(stop.boarding).toBe(3);
    sim.advance(2);
    const dropoff = sim.snapshot().cars[0].stops.find(s => s.floor === 8)!;
    expect(dropoff.beforeBoarding).toBe(0); expect(dropoff.exits).toBe(3);
  });
  it('E: seeded arrivals are timed, valid and match configurable residential assumptions', () => {
    for (const pattern of ['morning', 'evening', 'off-peak'] as const) {
      const seen: { origin: number; destination: number; at: number }[] = [];
      const sim = new Simulation({ seed: 71 });
      // Capture only at materialization, not via prediction/public DTOs.
      const add = sim.addPassenger.bind(sim);
      sim.addPassenger = (session, origin, destination) => { seen.push({ origin, destination, at: sim.now }); return add(session, origin, destination); };
      sim.generate(100, pattern);
      expect(sim.requests).toHaveLength(0);
      sim.advance(700);
      expect(seen).toHaveLength(100);
      expect(new Set(seen.map(r => r.at)).size).toBe(100);
      expect(seen.every(r => r.origin !== r.destination && r.origin >= 1 && r.origin <= 10 && r.destination >= 1 && r.destination <= 10)).toBe(true);
      const share = seen.filter(r => pattern === 'morning' ? r.destination === 1 : pattern === 'evening' ? r.origin === 1 : r.origin === 1 || r.destination === 1).length / 100;
      expect(Math.abs(share - (pattern === 'off-peak' ? defaults.offPeakLobbyShare : defaults.morningLobbyShare))).toBeLessThan(0.12);
      const repeat = new Simulation({ seed: 71 }); repeat.generate(100, pattern); repeat.advance(700);
      expect(repeat.snapshot()).toEqual(sim.snapshot());
      expect(JSON.stringify(sim.knowledge())).not.toContain('destination');
    }
  });
  it('G: bounded heavy residential demand drains with no lost or duplicate passengers', () => {
    for (const seed of [1, 42, 97]) {
      const sim = new Simulation({ seed, boardingLimit: 3, comfort: 2 });
      sim.generate(80, 'heavy');
      for (let i = 0; i < 300; i++) {
        sim.advance(10);
        expect(sim.cars.every(c => c.onboard.length <= 3)).toBe(true);
        const onboard = sim.cars.flatMap(c => c.onboard);
        expect(new Set(onboard).size).toBe(onboard.length);
        for (const r of sim.requests.filter(r => r.status === 'waiting')) {
          expect(sim.snapshot().cars.flatMap(c => c.stops).some(s => s.pickupIds.includes(r.id))).toBe(true);
        }
      }
      expect(sim.requests).toHaveLength(80);
      expect(sim.requests.every(r => r.status === 'completed')).toBe(true);
      expect(sim.events.filter(e => e.type === 'boarding')).toHaveLength(80);
    }
  });
});
