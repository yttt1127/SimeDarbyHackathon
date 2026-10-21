import type { Observation } from '../shared/types';
export interface CurrentCounts { now: number; cars: Record<string, number>; lobbies: Record<number, number> }
export interface SensorFrame { cars: Record<string, Observation>; lobbies: Record<number, Observation> }
export interface OccupancySensor { observe(current: CurrentCounts): SensorFrame }
export class MockCamera implements OccupancySensor {
  constructor(private error = 0, private seed = 42) {}
  observe(current: CurrentCounts): SensorFrame {
    const observation = (count: number, index: number): Observation => {
      const offset = this.error ? (Math.abs(Math.sin(this.seed + index * 17 + Math.floor(current.now))) * 2 - 1) * this.error : 0;
      return { count: Math.max(0, Math.round(count + offset)), timestamp: current.now, uncertainty: this.error };
    };
    return {
      cars: Object.fromEntries(Object.entries(current.cars).map(([id, count], i) => [id, observation(count, i)])),
      lobbies: Object.fromEntries(Object.entries(current.lobbies).map(([floor, count]) => [floor, observation(count, Number(floor) + 100)])),
    };
  }
}
