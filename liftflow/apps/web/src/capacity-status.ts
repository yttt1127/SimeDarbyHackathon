import type { ForecastStop } from '../../../packages/shared/types';

// Presentation only: these bands never feed scheduling or assignment.
export function capacityStatus(count: number, limit: number, uncertainty = 0) {
  if (!Number.isFinite(count) || !Number.isFinite(limit) || limit <= 0 || !Number.isFinite(uncertainty) || uncertainty > 0)
    return { tone: 'neutral', label: 'Uncertain' };
  const fraction = count / limit;
  if (fraction >= 1) return { tone: 'full', label: 'Full' };
  if (fraction >= 15 / 16) return { tone: 'full', label: 'Nearly full' };
  if (fraction >= 10 / 16) return { tone: 'limited', label: 'Limited' };
  return { tone: 'available', label: 'Available' };
}

export function pickupCapacityStatus(stop: ForecastStop, limit: number, uncertainty: number, requestId?: string) {
  // Include passengers ahead in the pickup queue, after known exits.
  const ahead = requestId ? Math.max(0, stop.pickupIds.indexOf(requestId)) : 0;
  return capacityStatus(stop.beforeBoarding + ahead, limit, uncertainty);
}
