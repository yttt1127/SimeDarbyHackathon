import { defaults, type Config, type Car, type Passenger, type Request, type Knowledge, type SimEvent, type Snapshot, type Candidate } from '../shared/types';
import { collective, type SchedulingPolicy } from '../scheduling/collective';
import { CapacityAssignment, type AssignmentPolicy } from '../scheduling/assignment';
import { forecast } from '../prediction/forecast';
import { MockCamera, type OccupancySensor } from '../sensors/mock-camera';

export class Simulation {
  readonly config: Config;
  now = 0;
  running = false;
  speed = 1;
  revision = 0;
  cars: Car[] = [];
  requests: Request[] = [];
  private passengers: Passenger[] = [];
  events: SimEvent[] = [];
  private nextId = 1;
  private eventSequence = 0;
  private randomState: number;
  private deferred = new Set<string>();
  private sensor: OccupancySensor;
  private assignment: AssignmentPolicy;
  constructor(config: Partial<Config> = {}, private scheduler: SchedulingPolicy = collective, sensor?: OccupancySensor, assignment?: AssignmentPolicy) {
    this.config = { ...defaults, ...config };
    this.validateConfig();
    this.randomState = this.config.seed;
    this.sensor = sensor ?? new MockCamera(this.config.sensorError, this.config.seed);
    this.assignment = assignment ?? new CapacityAssignment(scheduler);
    this.reset();
  }
  private validateConfig() {
    for (const [key, min, max] of [
      ['floors', 2, 40], ['elevators', 1, 6], ['comfort', 1, 50], ['boardingLimit', 1, 50],
      ['travelSeconds', 0.5, 30], ['stopSeconds', 1, 60], ['riskWeight', 0, 300],
      ['delayWeight', 0, 10], ['sensorError', 0, 5], ['seed', 0, 2147483647],
    ] as const) {
      const value = this.config[key];
      if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${key}: ${min}–${max} required`);
    }
    for (const key of ['floors', 'elevators', 'comfort', 'boardingLimit', 'seed'] as const)
      if (!Number.isInteger(this.config[key])) throw new Error(`${key} must be an integer`);
  }
  reset() {
    this.now = 0; this.running = false; this.speed = 1;
    this.requests = []; this.passengers = []; this.events = []; this.nextId = 1;
    this.eventSequence = 0; this.randomState = this.config.seed; this.deferred.clear();
    this.cars = Array.from({ length: this.config.elevators }, (_, i) => ({
      id: `Lift ${String.fromCharCode(65 + i)}`, position: 1, direction: 'IDLE', phase: 'IDLE',
      onboard: [], calls: [], phaseEnd: Infinity, departureAt: 0, departurePosition: 1,
    }));
    this.log('control', 'Simulation reset'); this.revision++;
  }
  private log(type: SimEvent['type'], message: string, requestId?: string, elevatorId?: string) {
    this.events.push({ sequence: ++this.eventSequence, at: this.now, type, message, requestId, elevatorId });
  }
  private counts() {
    return { now: this.now,
      cars: Object.fromEntries(this.cars.map(c => [c.id, c.onboard.length])),
      lobbies: Object.fromEntries(Array.from({ length: this.config.floors }, (_, i) => [i + 1, this.requests.filter(r => r.origin === i + 1 && r.status === 'waiting').length])),
    };
  }
  knowledge(): Knowledge {
    const frame = this.sensor.observe(this.counts());
    return {
      now: this.now, config: { ...this.config },
      cars: this.cars.map(c => ({ id: c.id, position: c.position, direction: c.direction, phase: c.phase,
        phaseEnd: c.phaseEnd, committed: c.committed ? structuredClone(c.committed) : undefined,
        calls: structuredClone(c.calls), observation: frame.cars[c.id] })),
      requests: this.requests.filter(r => r.status === 'waiting').map(r => ({
        id: r.id, origin: r.origin, direction: r.direction, assignedElevator: r.assignedElevator, deferred: this.deferred.has(r.id),
      })),
    };
  }
  snapshot(): Snapshot {
    const knowledge = this.knowledge();
    const counts = this.counts();
    const frame = this.sensor.observe(counts);
    return { revision: this.revision, now: this.now, running: this.running, speed: this.speed, config: { ...this.config },
      cars: knowledge.cars.map(c => ({ ...c, actualOccupancy: this.cars.find(a => a.id === c.id)!.onboard.length,
        stops: forecast(c, this.scheduler.plan(c, knowledge.requests), knowledge) })),
      requests: structuredClone(this.requests),
      passengers: this.passengers.map(p => ({ id: p.id, status: p.status, elevatorId: p.elevatorId })),
      lobbies: Object.entries(counts.lobbies).map(([floor, actual]) => ({ floor: Number(floor), actual, observation: frame.lobbies[Number(floor)] })),
      events: structuredClone(this.events.slice(-120)).reverse(),
    };
  }
  private random() {
    this.randomState = (Math.imul(1664525, this.randomState) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  addPassenger(sessionId: string, origin: number, destination: number): Request {
    if (!sessionId || !Number.isInteger(origin) || !Number.isInteger(destination) || origin < 1 || origin > this.config.floors ||
      destination < 1 || destination > this.config.floors || origin === destination) throw new Error('Choose distinct valid origin and destination floors');
    const id = this.nextId++;
    const request: Request = { id: `R${id}`, passengerId: `P${id}`, sessionId, origin, direction: destination > origin ? 'UP' : 'DOWN',
      createdAt: this.now, status: 'waiting', assignedElevator: '', explanation: '' };
    const best = this.assignment.candidates(this.knowledge(), request)[0];
    request.assignedElevator = best.elevatorId; request.explanation = best.explanation;
    this.requests.push(request);
    this.passengers.push({ id: request.passengerId, requestId: request.id, destination, status: 'waiting' });
    this.log('request', `${request.id}: passenger waiting at floor ${origin}, ${request.direction}`, request.id);
    this.log('assignment', `${request.id} assigned to ${best.elevatorId}`, request.id, best.elevatorId);
    this.changed();
    return structuredClone(request);
  }
  requestDirection(sessionId: string, origin: number, direction: string) {
    if (!['UP', 'DOWN'].includes(direction) || !Number.isInteger(origin) || origin < 1 || origin > this.config.floors ||
      (direction === 'UP' && origin === this.config.floors) || (direction === 'DOWN' && origin === 1)) throw new Error('Invalid floor or direction');
    // Private simulation truth. No destination is exposed until this passenger boards.
    const destination = direction === 'UP' ? origin + 1 + Math.floor(this.random() * (this.config.floors - origin))
      : 1 + Math.floor(this.random() * (origin - 1));
    return this.addPassenger(sessionId, origin, destination);
  }
  private ownedPending(sessionId: string, id: string) {
    const request = this.requests.find(r => r.id === id);
    if (!request || request.sessionId !== sessionId) throw new Error('Request does not belong to this session');
    if (request.status !== 'waiting') throw new Error('Only waiting requests can be changed');
    const car = this.cars.find(c => c.id === request.assignedElevator)!;
    if (car.committed?.floor === request.origin && car.committed.direction === request.direction)
      throw new Error('This stop is physically committed; cancellation or reassignment is unavailable');
    return request;
  }
  private recordRemoval(oldCar: string, oldRoute: ReturnType<Simulation['snapshot']>['cars'][number]['stops']) {
    const route = this.snapshot().cars.find(c => c.id === oldCar)!.stops;
    for (const stop of oldRoute) {
      if (!route.some(s => s.floor === stop.floor && s.direction === stop.direction))
        this.log('stop-removal', `${oldCar}: unnecessary floor ${stop.floor} stop removed`, undefined, oldCar);
    }
  }
  cancel(sessionId: string, id: string) {
    const request = this.ownedPending(sessionId, id);
    const oldRoute = this.snapshot().cars.find(c => c.id === request.assignedElevator)!.stops;
    request.status = 'cancelled';
    this.passengers.find(p => p.id === request.passengerId)!.status = 'cancelled';
    this.deferred.delete(id);
    this.log('cancellation', `${id} cancelled by its passenger`, id, request.assignedElevator);
    this.recordRemoval(request.assignedElevator, oldRoute);
    this.changed();
  }
  alternatives(sessionId: string, id: string): Candidate[] {
    const request = this.requests.find(r => r.id === id && r.sessionId === sessionId && r.status === 'waiting');
    if (!request) return [];
    try { this.ownedPending(sessionId, id); } catch { return []; }
    const candidates = this.assignment.candidates(this.knowledge(), request);
    const assigned = candidates.find(c => c.elevatorId === request.assignedElevator)!;
    // Stable assignment: no automatic switching; require material risk and score improvement.
    return candidates.filter(c => c.elevatorId !== request.assignedElevator && assigned.risk >= 0.5 &&
      c.risk < assigned.risk && c.score + 3 < assigned.score);
  }
  reassign(sessionId: string, id: string, elevatorId: string) {
    const request = this.ownedPending(sessionId, id);
    const candidate = this.alternatives(sessionId, id).find(c => c.elevatorId === elevatorId);
    if (!candidate) throw new Error('Alternative is no longer beneficial or available');
    const oldCar = request.assignedElevator;
    const oldRoute = this.snapshot().cars.find(c => c.id === oldCar)!.stops;
    request.assignedElevator = elevatorId; request.explanation = candidate.explanation; this.deferred.delete(id);
    this.log('reassignment', `${id}: passenger accepted ${elevatorId} instead of ${oldCar}`, id, elevatorId);
    this.recordRemoval(oldCar, oldRoute); this.changed();
  }
  private changed() {
    this.revision++;
    this.log('prediction', 'Schedules and occupancy forecasts updated');
  }
  control(action: 'start' | 'pause' | 'resume' | 'reset' | 'step', speed?: number) {
    if (speed !== undefined) {
      if (![0.5, 1, 2, 4, 8].includes(speed)) throw new Error('Unsupported simulation speed');
      this.speed = speed;
    }
    if (action === 'reset') { this.reset(); return; }
    if (action === 'pause') this.running = false;
    if (action === 'start' || action === 'resume') this.running = true;
    if (action === 'step') { this.running = false; this.advance(1); }
    this.log('control', `${action} · ${this.speed}× speed`); this.revision++;
  }
  tick(wallSeconds: number) { if (this.running) this.advance(wallSeconds * this.speed); }
  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 3600) throw new Error('Invalid time advance');
    const target = this.now + seconds;
    this.dispatch();
    let guard = 0;
    while (true) {
      const next = Math.min(...this.cars.map(c => c.phaseEnd));
      if (next > target || !Number.isFinite(next)) break;
      if (++guard > 100000) throw new Error('Event loop failed to progress');
      this.moveTo(next);
      const due = this.cars.filter(c => c.phaseEnd <= this.now + 1e-8);
      for (const car of due) this.transition(car);
      this.dispatch();
    }
    this.moveTo(target); this.revision++;
  }
  private moveTo(time: number) {
    this.now = time;
    for (const car of this.cars) if (car.phase === 'MOVING') {
      const duration = car.phaseEnd - car.departureAt;
      const progress = duration ? Math.min(1, (time - car.departureAt) / duration) : 1;
      car.position = car.departurePosition + (car.committed!.floor - car.departurePosition) * progress;
    }
  }
  private dispatch() {
    for (const car of this.cars) {
      if (car.phase !== 'IDLE') continue;
      const knowledge = this.knowledge();
      const stop = this.scheduler.plan(knowledge.cars.find(c => c.id === car.id)!, knowledge.requests)[0];
      if (!stop) { car.direction = 'IDLE'; continue; }
      car.committed = { ...stop, committed: true };
      car.departureAt = this.now; car.departurePosition = car.position;
      car.direction = stop.floor > car.position ? 'UP' : stop.floor < car.position ? 'DOWN' : stop.direction;
      car.phase = 'MOVING';
      car.phaseEnd = this.now + Math.abs(stop.floor - car.position) * this.config.travelSeconds;
    }
  }
  private transition(car: Car) {
    const stop = car.committed!;
    if (car.phase === 'MOVING') {
      car.position = stop.floor; car.direction = stop.direction;
      car.phase = 'OPENING'; car.phaseEnd = this.now + this.config.stopSeconds * 0.25;
      this.log('arrival', `${car.id} arrived at floor ${stop.floor}`, undefined, car.id);
    } else if (car.phase === 'OPENING') {
      stop.dropoffIds = car.calls.filter(c => c.floor === stop.floor).map(c => c.passengerId);
      for (const id of [...car.onboard]) {
        const passenger = this.passengers.find(p => p.id === id)!;
        if (passenger.destination !== stop.floor) continue;
        car.onboard = car.onboard.filter(p => p !== id); car.calls = car.calls.filter(c => c.passengerId !== id);
        passenger.status = 'exiting';
        this.requests.find(r => r.id === passenger.requestId)!.status = 'completed';
        this.log('exit', `${id} exiting ${car.id} at floor ${stop.floor}`, passenger.requestId, car.id);
      }
      const waiting = this.requests.filter(r => r.status === 'waiting' && r.assignedElevator === car.id && r.origin === stop.floor && r.direction === stop.direction);
      stop.pickupIds = waiting.map(r => r.id);
      for (const request of waiting) {
        if (car.onboard.length >= this.config.boardingLimit) {
          this.deferred.add(request.id);
          this.log('failed-boarding', `${request.id} remains waiting: simulated boarding limit reached`, request.id, car.id);
          continue;
        }
        const passenger = this.passengers.find(p => p.id === request.passengerId)!;
        passenger.status = 'boarding'; passenger.elevatorId = car.id; request.status = 'onboard';
        car.onboard.push(passenger.id); car.calls.push({ passengerId: passenger.id, floor: passenger.destination });
        this.deferred.delete(request.id);
        this.log('boarding', `${passenger.id} boarding ${car.id}; destination call ${passenger.destination} registered`, request.id, car.id);
      }
      car.phase = 'BOARDING'; car.phaseEnd = this.now + this.config.stopSeconds * 0.5; this.changed();
    } else if (car.phase === 'BOARDING') {
      for (const passenger of this.passengers.filter(p => p.elevatorId === car.id)) {
        if (passenger.status === 'boarding') passenger.status = 'riding';
        if (passenger.status === 'exiting') passenger.status = 'completed';
      }
      car.phase = 'CLOSING'; car.phaseEnd = this.now + this.config.stopSeconds * 0.25;
    } else if (car.phase === 'CLOSING') {
      car.phase = 'IDLE'; car.phaseEnd = Infinity; car.committed = undefined;
    }
  }
  generate(count = 8, pattern: 'mixed' | 'up-peak' = 'mixed') {
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Generate 1–100 passengers');
    for (let i = 0; i < count; i++) {
      const origin = pattern === 'up-peak' ? 1 : 1 + Math.floor(this.random() * this.config.floors);
      let destination = 1 + Math.floor(this.random() * (this.config.floors - 1));
      if (destination >= origin) destination++;
      this.addPassenger('synthetic', origin, destination);
    }
  }
}
