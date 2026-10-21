import type { Direction, KnownCar, KnownRequest, Stop } from '../shared/types';

export interface SchedulingPolicy { plan(car: KnownCar, requests: KnownRequest[]): Stop[] }
const sign = (direction: Direction) => direction === 'DOWN' ? -1 : 1;
export const collective: SchedulingPolicy = {
  plan(car, requests) {
    let halls = requests.filter(r => r.assignedElevator === car.id);
    let deferred = halls.filter(r => r.deferred);
    halls = halls.filter(r => !r.deferred);
    let calls = [...car.calls];
    const route: Stop[] = [];
    let position = car.position;
    let direction: Direction = car.direction;
    const visit = (floor: number, serviceDirection: Direction, committed = false) => {
      const pickups = halls.filter(r => r.origin === floor && r.direction === serviceDirection);
      const drops = calls.filter(c => c.floor === floor);
      const stop: Stop = { key: `${floor}-${serviceDirection}-${route.length}`, floor, direction: serviceDirection,
        pickupIds: pickups.map(r => r.id), dropoffIds: drops.map(c => c.passengerId), committed };
      route.push(stop);
      halls = halls.filter(r => !stop.pickupIds.includes(r.id));
      calls = calls.filter(c => c.floor !== floor);
      position = floor;
    };
    if (car.committed) {
      // Boarding has already happened in these phases; new hall requests wait for a later visit.
      const inService = car.phase === 'BOARDING' || car.phase === 'CLOSING';
      if (inService) {
        route.push({ ...car.committed, committed: true, serviced: true });
        position = car.committed.floor;
      } else {
        const committedDeferred = deferred.filter(r => r.origin === car.committed!.floor && r.direction === car.committed!.direction);
        halls.push(...committedDeferred);
        deferred = deferred.filter(r => !committedDeferred.includes(r));
        visit(car.committed.floor, car.committed.direction, true);
      }
      direction = car.committed.direction;
    }
    if (direction === 'IDLE') {
      const nearest = [...halls.map(r => r.origin), ...calls.map(c => c.floor)].sort((a, b) => Math.abs(a - position) - Math.abs(b - position))[0];
      direction = nearest === undefined ? 'UP' : nearest > position ? 'UP' : nearest < position ? 'DOWN' : halls.find(r => r.origin === nearest)?.direction ?? 'UP';
    }
    // A finite sweep consumes at least one call, or reverses to reach remaining calls.
    for (let guard = 0; (halls.length || calls.length || deferred.length) && guard < 10000; guard++) {
      if (!halls.length && !calls.length) { halls = deferred; deferred = []; }
      const s = sign(direction);
      const compatible = halls.filter(r => r.direction === direction && (r.origin - position) * s >= 0);
      const forwardCalls = calls.filter(c => (c.floor - position) * s >= 0);
      const floors = [...compatible.map(r => r.origin), ...forwardCalls.map(c => c.floor)];
      if (floors.length) {
        const floor = floors.sort((a, b) => (a - b) * s)[0];
        visit(floor, direction);
        continue;
      }
      const ahead = halls.filter(r => (r.origin - position) * s > 0);
      if (ahead.length) {
        // Travel to the farthest reverse-direction pickup to begin the return sweep.
        const floor = ahead.map(r => r.origin).sort((a, b) => (b - a) * s)[0];
        direction = direction === 'UP' ? 'DOWN' : 'UP';
        visit(floor, direction);
      } else {
        direction = direction === 'UP' ? 'DOWN' : 'UP';
      }
    }
    if (halls.length || calls.length || deferred.length) throw new Error('Collective scheduler did not converge');
    return route;
  },
};
