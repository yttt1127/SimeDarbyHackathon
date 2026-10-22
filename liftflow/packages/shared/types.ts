export type Direction = 'UP' | 'DOWN' | 'IDLE';
export type Phase = 'IDLE' | 'MOVING' | 'OPENING' | 'BOARDING' | 'CLOSING';
export type PassengerStatus = 'waiting' | 'boarding' | 'riding' | 'exiting' | 'completed' | 'cancelled';
export interface Config {
  floors: number; elevators: number; comfort: number; boardingLimit: number;
  travelSeconds: number; stopSeconds: number; riskWeight: number; delayWeight: number;
  sensorError: number; seed: number;
  morningLobbyShare: number; eveningLobbyShare: number; offPeakLobbyShare: number;
}
export const defaults: Config = { floors: 10, elevators: 2, comfort: 10, boardingLimit: 10,
  travelSeconds: 4, stopSeconds: 8, riskWeight: 30, delayWeight: 0.25, sensorError: 0, seed: 42, morningLobbyShare: 0.75, eveningLobbyShare: 0.75, offPeakLobbyShare: 0.65 };
export interface Passenger { id: string; requestId: string; destination: number; status: PassengerStatus; elevatorId?: string }
export interface Request {
  id: string; sessionId: string; passengerId: string; origin: number; direction: Exclude<Direction, 'IDLE'>;
  createdAt: number; status: 'waiting' | 'onboard' | 'completed' | 'cancelled';
  assignedElevator: string; explanation: string;
}
export interface Stop { key: string; floor: number; direction: Direction; pickupIds: string[]; dropoffIds: string[]; committed?: boolean; serviced?: boolean }
export interface CarCall { passengerId: string; floor: number }
export interface Car {
  id: string; position: number; direction: Direction; phase: Phase;
  onboard: string[]; calls: CarCall[]; committed?: Stop;
  phaseEnd: number; departureAt: number; departurePosition: number;
}
export interface Observation {
  count: number; timestamp: number; uncertainty: number;
  objectPresence?: string[]; occupiedSpaceFraction?: number;
}
// Intentional information barrier: no Passenger, private destination or event queue.
export interface KnownCar {
  id: string; position: number; direction: Direction; phase: Phase;
  phaseEnd: number; committed?: Stop; calls: CarCall[]; observation: Observation;
}
export interface KnownRequest { id: string; origin: number; direction: Exclude<Direction, 'IDLE'>; assignedElevator: string; deferred?: boolean }
export interface Knowledge { now: number; config: Config; cars: KnownCar[]; requests: KnownRequest[] }
export interface ForecastStop extends Stop {
  eta: number; arrivalAt: number; arriving: number; exits: number; boarding: number;
  beforeBoarding: number; after: number; spaces: number; boardingSpaces: number; waiting: number;
  availability: 'Likely space available' | 'Likely full' | 'Uncertain';
}
export interface Candidate { elevatorId: string; eta: number; spaces: number; risk: number; delay: number; score: number; explanation: string }
export type EventType = 'request' | 'assignment' | 'arrival' | 'boarding' | 'failed-boarding' | 'exit' | 'cancellation' | 'reassignment' | 'stop-removal' | 'prediction' | 'control' | 'bypass';
export interface SimEvent { sequence: number; at: number; type: EventType; message: string; requestId?: string; elevatorId?: string }
export interface CarView extends KnownCar { actualOccupancy: number; stops: ForecastStop[] }
export interface Snapshot {
  revision: number; now: number; running: boolean; speed: number; config: Config;
  pendingArrivals: number;
  cars: CarView[]; requests: Request[]; passengers: { id: string; status: PassengerStatus; elevatorId?: string }[];
  lobbies: { floor: number; actual: number; observation: Observation }[];
  events: SimEvent[];
}
