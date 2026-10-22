import type { ForecastStop, Knowledge, KnownCar, Stop } from '../shared/types';

export function forecast(car: KnownCar, route: Stop[], knowledge: Knowledge): ForecastStop[] {
  const { now, config, requests } = knowledge;
  let occupancy = car.observation.count;
  let position = car.position;
  let elapsed = 0;
  return route.map((stop, index) => {
    const active = index === 0 && stop.committed && car.phase !== 'MOVING' && car.phase !== 'IDLE';
    if (index === 0 && stop.committed && car.phase === 'MOVING') elapsed = Math.max(0, car.phaseEnd - now);
    else if (!active) elapsed += Math.abs(stop.floor - position) * config.travelSeconds;
    const arriving = occupancy;
    const exits = stop.serviced ? 0 : Math.min(occupancy, stop.dropoffIds.length);
    const beforeBoarding = Math.max(0, occupancy - exits);
    const spaces = Math.max(0, config.comfort - beforeBoarding);
    const boardingSpaces = Math.max(0, config.boardingLimit - beforeBoarding);
    const waiting = stop.pickupIds.filter(id => requests.some(r => r.id === id)).length;
    const boarding = stop.serviced ? 0 : Math.min(waiting, boardingSpaces);
    occupancy = beforeBoarding + boarding;
    const uncertainty = car.observation.uncertainty;
    const availability = boardingSpaces + uncertainty < Math.max(1, waiting) ? 'Likely full'
      : spaces - uncertainty >= Math.max(1, waiting) ? 'Likely space available' : 'Uncertain';
    const result: ForecastStop = { ...stop, eta: elapsed, arrivalAt: now + elapsed,
      arriving, exits, beforeBoarding, boarding, after: occupancy, spaces, boardingSpaces, waiting, availability };
    if (active) {
      const remaining = Math.max(0, car.phaseEnd - now);
      elapsed = remaining + (car.phase === 'OPENING' ? config.stopSeconds * 0.75 : car.phase === 'BOARDING' ? config.stopSeconds * 0.25 : 0);
    } else elapsed += config.stopSeconds;
    position = stop.floor;
    return result;
  });
}
