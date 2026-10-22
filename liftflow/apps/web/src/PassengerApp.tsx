import React, { useEffect, useRef, useState } from 'react';
import type { CarView, Snapshot } from '../../../packages/shared/types';
import './passenger.css';
import { capacityStatus, pickupCapacityStatus } from './capacity-status';
import { floorLabel as floorNumber } from './passenger-format';

type Props = {
  state: Snapshot;
  session?: { token: string; sessionId: string };
  connected: boolean;
  busy: boolean;
  error: string;
  command: (path: string, data: unknown) => Promise<boolean>;
  onDashboard: () => void;
};
const directionLabel = (car: CarView) => car.direction === 'UP' ? '↑ UP' : car.direction === 'DOWN' ? '↓ DOWN' : '— IDLE';

export function PassengerApp({ state, session, connected, busy, error, command, onDashboard }: Props) {
  // Explicit demo source only. No inference from network or physical location.
  const [floor, setFloor] = useState<number | null>(Math.min(4, state.config.floors));
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const details = useRef<HTMLDialogElement>(null);
  const callSheet = useRef<HTMLDialogElement>(null);
  const locationSheet = useRef<HTMLDialogElement>(null);
  const mine = state.requests.filter(r => r.sessionId === session?.sessionId);
  const request = [...mine].reverse().find(r => r.status === 'waiting' || r.status === 'onboard');
  const last = request ?? mine.at(-1);
  const origin = request?.origin ?? floor;
  const assignedCar = state.cars.find(car => car.id === request?.assignedElevator);
  const pickup = assignedCar?.stops.find(stop => !stop.serviced && stop.pickupIds.includes(request?.id ?? ''));
  const committed = !!request && assignedCar?.committed?.floor === request.origin && assignedCar?.committed?.direction === request.direction;
  const locked = !connected || !session || busy || pending;

  useEffect(() => {
    document.title = 'ZeroWait · Your next ride';
    return () => { document.title = 'LiftFlow · Live elevator intelligence'; };
  }, []);
  useEffect(() => {
    if (floor !== null && floor > state.config.floors) setFloor(null);
  }, [floor, state.config.floors]);
  useEffect(() => {
    if (request) {
      submitting.current = false;
      setPending(false);
      callSheet.current?.close();
    }
  }, [request?.id]);

  // Only the assigned pickup has an authoritative future boarding forecast.
  // Other cars show current observed capacity, clearly labelled as such.
  const outlook = (car: CarView) => {
    if (request?.status !== 'waiting' || car.id !== request.assignedElevator) return capacityStatus(car.observation.count, state.config.boardingLimit, car.observation.uncertainty);
    if (!pickup) return { tone: 'neutral', label: 'Replanning' };
    return pickupCapacityStatus(pickup, state.config.boardingLimit, car.observation.uncertainty, request.id);
  };
  const submit = async (direction: 'UP' | 'DOWN') => {
    if (submitting.current || locked || request || floor === null || floor < 1 || floor > state.config.floors || (direction === 'UP' ? floor === state.config.floors : floor === 1)) return;
    submitting.current = true;
    setPending(true);
    // Keep the lock after HTTP success until the shared state confirms the call.
    // This also covers a slow WebSocket update after the HTTP response.
    const success = await command('request', { origin: floor, direction });
    if (success) callSheet.current?.close();
    else { submitting.current = false; setPending(false); }
  };
  const floorPicker = <label className="p-demo-picker">Simulated floor<select aria-label="Simulated floor" value={floor ?? ''} disabled={locked || !!request} onChange={event => setFloor(event.target.value ? Number(event.target.value) : null)}><option value="">Select a floor</option>{Array.from({ length: state.config.floors }, (_, i) => <option key={i} value={i + 1}>{String(i + 1).padStart(2, '0')}{i === 0 ? ' · Lobby' : ''}</option>)}</select></label>;
  const capacity = assignedCar ? outlook(assignedCar) : { tone: 'neutral', label: 'Replanning' };

  return <div className={`passenger-shell ${request ? 'has-request' : ''}`}>
    <header className="p-topbar"><button onClick={onDashboard} aria-label="Building overview" className="p-back">←</button><a href="/" className="p-wordmark">zerowait<span>.</span></a><span className={`p-live ${connected ? '' : 'offline'}`}><i />{connected ? 'Live connection' : 'Reconnecting'}</span></header>
    <main className="p-main">
      <div className="p-heading"><div><p>NORTHLINE RESIDENCES</p><h1>Your next ride.</h1></div></div>
      <div className="p-demo-location"><span>{origin === null ? 'Demo floor not set' : `Demo Floor ${String(origin).padStart(2, '0')}`}</span><button disabled={locked || !!request} onClick={() => locationSheet.current?.showModal()}>Change</button><small>Simulated location</small></div>
      {error && <p className="p-feedback error" role="alert">{error}</p>}
      {!connected && <p className="p-feedback" role="status">Reconnecting. Lift information may be out of date.</p>}
      <section className="p-hero" aria-label="Live lift overview">
        <div className="p-hero-heading"><div className="p-building-symbol">↕</div><div><h2>Your building’s lifts</h2><p>We’ll find your best way up. Or down.</p></div><span className="p-live-pill">{connected ? 'LIVE' : 'OFFLINE'}</span></div>
        <div className="p-shafts">{state.cars.map(car => {
          const info = outlook(car);
          return <article key={car.id} className={`p-shaft tone-${info.tone} ${request?.assignedElevator === car.id ? 'assigned' : ''}`} aria-label={car.id} data-testid={`overview-${car.id}`}>
            <div className="p-car-label"><span>{car.id}</span><b data-testid="current-floor">{floorNumber(car)}<em>F</em></b><small>CURRENT FLOOR</small></div>
            <div aria-hidden="true" className={`p-door-frame ${car.phase === 'OPENING' || car.phase === 'BOARDING' ? 'open' : ''}`}><div className="p-door-display">{car.direction === 'UP' ? '↑' : car.direction === 'DOWN' ? '↓' : '•'} {floorNumber(car)}</div><div className="p-door-opening"><i /><i /></div><span className="p-call-light" /></div>
            <span className="p-movement" data-testid="direction">{directionLabel(car)}</span>
            <span className={`p-capacity ${info.tone}`} data-testid="capacity"><i />{info.label}</span>
            <small className="p-status-context">{request?.status === 'waiting' && request.assignedElevator === car.id ? 'At your pickup · estimate' : 'Current capacity · estimate'}</small>
            <div className="p-upcoming"><small>Upcoming</small><p data-testid="upcoming-stops">{car.stops.filter(stop => !stop.serviced).map(stop => String(stop.floor).padStart(2, '0')).join(' → ') || 'No scheduled stops'}</p></div>
          </article>;
        })}</div>
        <div className="p-hero-footer">{request?.status === 'waiting' ? 'Assigned lift: pickup estimate · other lifts: current capacity' : 'Current capacity estimates · not a pickup forecast'}</div>
      </section>

      <div className="p-main-waiting"><span>Waiting at your floor</span><strong data-testid="main-waiting">{origin === null ? 'Select a floor' : `${state.lobbies.find(l => l.floor === origin)?.observation.count ?? '—'} people`}</strong><small>Observed · both directions</small></div>
      {request ? <section className="p-journey" aria-live="polite" aria-label="Your assignment">
        <p className="p-kicker">{request.status === 'onboard' ? 'YOUR JOURNEY' : 'YOUR ASSIGNED LIFT'}</p>
        <h2>{request.status === 'onboard' ? `You’re riding ${request.assignedElevator}` : assignedCar ? `${request.assignedElevator} is on its way` : 'Finding your lift'}</h2>
        {request.status === 'waiting' && <div className="p-pickup-eta" data-testid="pickup-eta">{pickup && Number.isFinite(pickup.eta) ? pickup.eta <= 0 ? 'Arriving now' : `ETA: ${Math.ceil(pickup.eta)} seconds` : 'Waiting · replanning your pickup'}</div>}
        {assignedCar && <p>Current Floor: {floorNumber(assignedCar)} · {directionLabel(assignedCar)}</p>}
        <span className={`p-capacity ${capacity.tone}`}><i />Capacity: {capacity.label}</span>
        {request.status === 'waiting' && <><p className="p-journey-note">{capacity.tone === 'full' ? 'Space may be limited when your lift arrives. Your call stays active if you cannot board.' : 'Your arrival estimate updates live.'}</p><button className="p-cancel" disabled={locked || committed} onClick={() => void command('cancel', { id: request.id })}>Cancel my request</button>{committed && <p className="p-lock-note">Your pickup is committed. Cancellation is no longer available.</p>}</>}
      </section> : last && <section className="p-ready" aria-live="polite"><span className="p-ready-icon">↕</span><h2>{last?.status === 'cancelled' ? 'Request cancelled' : last?.status === 'completed' ? 'You’ve arrived.' : 'Just choose your direction.'}</h2><p>We’ll take care of the lift.<br />A simpler journey starts here.</p></section>}

      <button className="p-details-trigger" onClick={() => details.current?.showModal()}><span>Lift details</span><span aria-hidden="true">↗</span></button>
      <p className="p-estimate-note">Capacity predictions are estimates, not boarding guarantees.</p>
      <div className="p-bottom-action"><p>{request ? 'Your journey updates automatically.' : 'Your direction. The right lift. Zero fuss.'}</p><button className="p-primary" disabled={locked || !!request} onClick={() => callSheet.current?.showModal()}>{pending ? 'Requesting your lift…' : request ? request.status === 'onboard' ? 'Journey underway' : 'Lift requested' : 'Call a lift'}<span aria-hidden="true">→</span></button><small>ZeroWait · A little less waiting.</small></div>
    </main>

    <dialog ref={callSheet} className="p-details-sheet p-call-sheet" aria-labelledby="p-call-title"><div className="p-sheet-inner"><header><div><p>LET’S GET YOU THERE</p><h2 id="p-call-title">Which direction are you going?</h2></div><button aria-label="Close direction sheet" onClick={() => callSheet.current?.close()}>×</button></header><p className="p-sheet-note">{floor === null ? 'Select your demo floor before calling a lift.' : `Demo Floor ${String(floor).padStart(2, '0')} · Your lift is assigned automatically.`}</p>{floor === null && floorPicker}{error && <p role="alert" className="p-feedback">{error}</p>}<div className="p-call-directions"><button disabled={locked || !!request || floor === null || floor === state.config.floors} onClick={() => void submit('UP')}><span>↑</span>Going Up</button><button disabled={locked || !!request || floor === null || floor === 1} onClick={() => void submit('DOWN')}><span>↓</span>Going Down</button></div><p role="status" className="p-sheet-note">{pending ? 'Requesting your lift…' : floor === 1 ? 'You’re at the lowest floor. Choose UP.' : floor === state.config.floors ? 'You’re at the top floor. Choose DOWN.' : 'Tap a direction to call. No extra steps.'}</p></div></dialog>
    <dialog ref={locationSheet} className="p-details-sheet" aria-labelledby="p-location-title"><div className="p-sheet-inner"><header><h2 id="p-location-title">Demo location</h2><button aria-label="Close demo location" onClick={() => locationSheet.current?.close()}>×</button></header><p className="p-sheet-note">This is a simulated floor for testing. Indoor positioning is not connected.</p>{floorPicker}<button className="p-primary p-location-done" onClick={() => locationSheet.current?.close()}>Done</button></div></dialog>
    <dialog ref={details} className="p-details-sheet" aria-labelledby="p-details-title"><div className="p-sheet-inner"><header><div><p>YOUR BUILDING’S LIFTS</p><h2 id="p-details-title">Lift details</h2></div><button aria-label="Close lift details" onClick={() => details.current?.close()}>×</button></header>
      <p className="p-sheet-note">Upcoming stops in travel order. Times and boarding availability are estimates.</p>
      {origin !== null && <div className="p-floor-waiting"><span>Waiting at Floor {String(origin).padStart(2, '0')}<small>Observed · both directions</small></span><strong data-testid="floor-waiting">{state.lobbies.find(l => l.floor === origin)?.observation.count ?? '—'}</strong></div>}
      {state.cars.map(car => <section className="p-floor-lift" key={car.id} aria-label={`${car.id} route details`}><header><h3>{car.id}</h3>{car.id === request?.assignedElevator && <span>Assigned to you</span>}</header><p className="p-sheet-note">Current Floor {floorNumber(car)}F · {directionLabel(car)}</p>
        {car.stops.filter(stop => !stop.serviced).map(stop => {
          const info = pickupCapacityStatus(stop, state.config.boardingLimit, car.observation.uncertainty, request?.id);
          const tone = info.tone;
          return <div className="p-floor-arrival" data-testid="floor-arrival" key={stop.key}><div><span>{stop.pickupIds.includes(request?.id ?? '') ? 'Your pickup · ' : ''}Floor {String(stop.floor).padStart(2, '0')} · {stop.direction}</span><b>{Number.isFinite(stop.eta) ? stop.eta <= 0 ? 'Arriving now' : `${Math.ceil(stop.eta)} seconds` : 'Calculating'}</b></div><span className={`p-capacity p-capacity-pill ${tone}`}><i />{info.label}</span></div>;
        })}
        {!car.stops.some(stop => !stop.serviced) && <p className="p-sheet-note">No scheduled stops</p>}
      </section>)}
      <p className="p-sheet-note">Colors indicate estimated capacity, not certified safety capacity.</p>
    </div></dialog>
  </div>;
}
