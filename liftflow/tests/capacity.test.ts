import { expect, it } from 'vitest';
import { Simulation } from '../packages/simulation/engine';
import { CapacityAssignment } from '../packages/scheduling/assignment';
import { capacityStatus, pickupCapacityStatus } from '../apps/web/src/capacity-status';

it('defaults to two lifts, ten floors and sixteen places; excess passengers wait until exits', () => {
  expect(new Simulation().config).toMatchObject({ elevators: 2, floors: 10, boardingLimit: 16 });
  const sim = new Simulation({ elevators: 1 });
  for (let i = 0; i < 15; i++) sim.addPassenger('load', 1, 10);
  sim.advance(2);
  expect(sim.cars[0].onboard).toHaveLength(15);
  const lastPlace = sim.addPassenger('last', 3, 10);
  const excess = sim.addPassenger('excess', 3, 10);
  let sawFull = false;
  for (let i = 0; i < 400; i++) {
    sim.advance(1);
    expect(sim.cars[0].onboard.length).toBeLessThanOrEqual(16);
    if (sim.cars[0].onboard.length === 16) {
      sawFull = true;
      expect(sim.requests.find(r => r.id === lastPlace.id)?.status).toBe('onboard');
      expect(sim.requests.find(r => r.id === excess.id)?.status).toBe('waiting');
    }
  }
  expect(sawFull).toBe(true);
  expect(sim.requests.every(r => r.status === 'completed')).toBe(true);
});

it('assignment ignores legacy comfort and accounts for known exits and sensor uncertainty', () => {
  const knowledge = new Simulation({ elevators: 1 }).knowledge();
  const request = { id: 'trial', origin: 3, direction: 'UP' as const, assignedElevator: '' };
  const policy = new CapacityAssignment();
  knowledge.cars[0].observation.count = 15;
  const spare = policy.candidates(knowledge, request)[0];
  expect(spare).toMatchObject({ spaces: 1, risk: 0 });
  knowledge.config.comfort = 1;
  expect(policy.candidates(knowledge, request)[0]).toEqual(spare);
  knowledge.cars[0].observation.uncertainty = 1;
  expect(policy.candidates(knowledge, request)[0].risk).toBeGreaterThan(0);
  knowledge.cars[0].observation = { count: 16, uncertainty: 0, timestamp: 0 };
  expect(policy.candidates(knowledge, request)[0]).toMatchObject({ spaces: 0, risk: 1 });
  knowledge.cars[0].calls = [{ passengerId: 'exit', floor: 3 }];
  expect(policy.candidates(knowledge, request)[0]).toMatchObject({ spaces: 1, risk: 0 });
});

it('uses proportional presentation bands and labels uncertainty without exposing truth', () => {
  for (const [count, tone, label] of [[0, 'available', 'Available'], [9, 'available', 'Available'], [10, 'limited', 'Limited'], [14, 'limited', 'Limited'], [15, 'full', 'Nearly full'], [16, 'full', 'Full']] as const) {
    expect(capacityStatus(count, 16)).toEqual({ tone, label });
    expect(capacityStatus(count * 2, 32)).toEqual({ tone, label });
  }
  expect(capacityStatus(9, 16, 1).label).toBe('Uncertain');
  expect(capacityStatus(NaN, 16).label).toBe('Uncertain');
  const sim = new Simulation({ elevators: 1 });
  sim.addPassenger('one', 3, 8); sim.addPassenger('two', 3, 8);
  const stop = sim.snapshot().cars[0].stops[0];
  stop.beforeBoarding = 15;
  expect(pickupCapacityStatus(stop, 16, 0, stop.pickupIds[0]).label).toBe('Nearly full');
  expect(pickupCapacityStatus(stop, 16, 0, stop.pickupIds[1]).label).toBe('Full');
});
