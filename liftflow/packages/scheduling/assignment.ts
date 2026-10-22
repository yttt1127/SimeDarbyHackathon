import type { Candidate, Knowledge, KnownRequest } from '../shared/types';
import { collective, type SchedulingPolicy } from './collective';
import { forecast } from '../prediction/forecast';
export interface AssignmentPolicy { candidates(knowledge: Knowledge, request: KnownRequest): Candidate[] }
export class CapacityAssignment implements AssignmentPolicy {
  constructor(private scheduler: SchedulingPolicy = collective) {}
  candidates(knowledge: Knowledge, request: KnownRequest): Candidate[] {
    const grouped = new Set<string>();
    const candidates = knowledge.cars.map(car => {
      const existing = knowledge.requests.filter(r => r.id !== request.id);
      const inserted = { ...request, deferred: false, assignedElevator: car.id };
      const trial = { ...knowledge, requests: [...existing, inserted] };
      const base = forecast(car, this.scheduler.plan(car, existing), { ...knowledge, requests: existing });
      const route = forecast(car, this.scheduler.plan(car, trial.requests), trial);
      const pickup = route.find(s => s.pickupIds.includes(request.id))!;
      const rank = pickup.pickupIds.indexOf(request.id) + 1;
      // Prefer an existing compatible hall visit only if the extra passenger fits.
      // Both grouping and risk use remaining hard boarding capacity.
      if (existing.some(r => r.origin === request.origin && r.direction === request.direction && r.assignedElevator === car.id && !r.deferred) &&
          pickup.boardingSpaces - car.observation.uncertainty >= rank && !pickup.serviced) grouped.add(car.id);
      const risk = Math.min(1, Math.max(0, (rank - pickup.spaces + car.observation.uncertainty) / Math.max(1, rank)));
      let delay = 0;
      for (const stop of base) {
        for (const id of [...stop.pickupIds, ...stop.dropoffIds]) {
          const changed = route.find(s => s.pickupIds.includes(id) || s.dropoffIds.includes(id));
          if (changed) delay += Math.max(0, changed.eta - stop.eta);
        }
      }
      const score = pickup.eta + knowledge.config.riskWeight * risk + knowledge.config.delayWeight * delay;
      return { elevatorId: car.id, eta: pickup.eta, spaces: pickup.spaces, risk, delay, score,
        explanation: `${car.id}: ${Math.ceil(pickup.eta)}s pickup, ${pickup.spaces} estimated spaces, ${Math.round(risk * 100)}% boarding risk; score ${score.toFixed(1)} (ETA + risk × ${knowledge.config.riskWeight} + added delay × ${knowledge.config.delayWeight}).` };
    });
    return candidates.sort((a, b) => Number(grouped.has(b.elevatorId)) - Number(grouped.has(a.elevatorId)) || a.score - b.score || a.elevatorId.localeCompare(b.elevatorId));
  }
}
