import type { CarView } from '../../../packages/shared/types';
// Show only a physically reached floor; continuous simulation position is unchanged.
export const reachedFloor = (car: Pick<CarView, 'position' | 'direction' | 'phase'>) =>
  car.phase === 'MOVING' && car.direction === 'DOWN' ? Math.ceil(car.position - 1e-8) : Math.floor(car.position + 1e-8);
export const floorLabel = (car: Pick<CarView, 'position' | 'direction' | 'phase'>) => String(reachedFloor(car)).padStart(2, '0');
