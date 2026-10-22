import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CarView, Snapshot } from '../../../packages/shared/types';
import { CapacityAssignment } from '../../../packages/scheduling/assignment';
import './passenger.css';

type Props = {
  state: Snapshot;
  session?: { token: string; sessionId: string };
  connected: boolean;
  busy: boolean;
  error: string;
  command: (path: string, data: unknown) => Promise<boolean>;
  onDashboard: () => void;
};
const policy = new CapacityAssignment();
const floorNumber = (car: CarView) => car.position.toFixed(car.phase === 'MOVING' ? 1 : 0).padStart(2, '0');
const directionLabel = (car: CarView) => car.direction === 'UP' ? '↑ UP' : car.direction === 'DOWN' ? '↓ DOWN' : '— IDLE';
const neutral = { tone: 'neutral', label: 'Awaiting direction' };

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

  // A direction is necessary for a meaningful pickup prediction. The actual
  // assignment and its ETA always come from the server's scheduled pickup.
  const candidates = useMemo(() => request?.status === 'waiting' ? policy.candidates({
    now: state.now, config: state.config, cars: state.cars,
    requests: state.requests.filter(r => r.status === 'waiting'),
  }, request) : [], [state, request]);
  const outlook = (car: CarView) => {
    if (!request) return neutral;
    if (request.status === 'onboard') return { tone: 'neutral', label: 'Journey underway' };
    const assigned = car.id === request.assignedElevator;
    const candidate = candidates.find(c => c.elevatorId === car.id);
    if (assigned && !pickup) return { tone: 'neutral', label: 'Replanning' };
    if (!assigned && !candidate) return { tone: 'neutral', label: 'Awaiting forecast' };
    const full = assigned ? pickup?.availability === 'Likely full' : (candidate?.risk ?? 0) >= 1;
    const spaces = assigned ? pickup?.spaces : candidate?.spaces;
    const limited = (assigned && pickup?.availability === 'Uncertain') || (spaces ?? 0) < 2 || car.observation.uncertainty > 0;
    return { tone: full ? 'full' : limited ? 'limited' : 'comfortable', label: full ? 'Likely full' : limited ? 'Limited space' : 'Comfortable' };
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
    <header className="p-topbar"><button onClick={onDashboard} aria-label="Building overview" className="p-back">←</button><a href="/passenger" className="p-wordmark">zerowait<span>.</span></a><span className={`p-live ${connected ? '' : 'offline'}`}><i />{connected ? 'Live connection' : 'Reconnecting'}</span></header>
    <main className="p-main">
      <div className="p-heading"><div><p>NORTHLINE RESIDENCES</p><h1>Your next ride.</h1></div></div>
      <div className="p-demo-location"><span>{origin === null ? 'Demo floor not set' : `Demo Floor ${String(origin).padStart(2, '0')}`}</span><button disabled={locked || !!request} onClick={() => locationSheet.current?.showModal()}>Change</button><small>Simulated location</small></div>
      {error && <p className="p-feedback error" role="alert">{error}</p>}
      {!connected && <p className="p-feedback" role="status">Reconnecting. Lift information may be out of date.</p>}
      <section className="p-hero" aria-label="Live lift overview">
        <div className="p-hero-heading"><div className="p-building-symbol">↕</div><div><h2>Your building’s lifts</h2><p>We’ll find your best way up. Or down.</p></div><span className="p-live-pill">{connected ? 'LIVE' : 'OFFLINE'}</span></div>
        <div className="p-shafts">{state.cars.map(car => {
          const info = outlook(car);
          return <article key={car.id} className={`p-shaft ${request?.assignedElevator === car.id ? 'assigned' : ''}`} aria-label={car.id} data-testid={`overview-${car.id}`}>
            <div className="p-car-label"><span>{car.id}</span><b data-testid="current-floor">{floorNumber(car)}</b><small>CURRENT FLOOR</small></div>
            <div aria-hidden="true" className={`p-door-frame ${car.phase === 'OPENING' || car.phase === 'BOARDING' ? 'open' : ''}`}><div className="p-door-display">{car.direction === 'UP' ? '↑' : car.direction === 'DOWN' ? '↓' : '•'} {floorNumber(car)}</div><div className="p-door-opening"><i /><i /></div><span className="p-call-light" /></div>
            <span className="p-movement" data-testid="direction">{directionLabel(car)}</span>
            <span className={`p-capacity ${info.tone}`} data-testid="capacity"><i />{info.label}</span>
          </article>;
        })}</div>
        <div className="p-hero-footer">{request?.status === 'waiting' ? 'Boarding outlook at your pickup floor · estimated' : 'Pickup outlook appears after you choose a direction.'}</div>
      </section>

      {request ? <section className="p-journey" aria-live="polite" aria-label="Your assignment">
        <p className="p-kicker">{request.status === 'onboard' ? 'YOUR JOURNEY' : 'YOUR ASSIGNED LIFT'}</p>
        <h2>{request.status === 'onboard' ? `You’re riding ${request.assignedElevator}` : assignedCar ? `${request.assignedElevator} is on its way` : 'Finding your lift'}</h2>
        {request.status === 'waiting' && <div className="p-pickup-eta" data-testid="pickup-eta">{pickup && Number.isFinite(pickup.eta) ? pickup.eta <= 0 ? 'Arriving now' : `ETA: ${Math.ceil(pickup.eta)} seconds` : 'Waiting · replanning your pickup'}</div>}
        {assignedCar && <p>Current Floor: {floorNumber(assignedCar)} · {directionLabel(assignedCar)}</p>}
        <span className={`p-capacity ${capacity.tone}`}><i />Capacity: {capacity.label}</span>
        {request.status === 'waiting' && <><p className="p-journey-note">{capacity.tone === 'full' ? 'Space may be limited when your lift arrives. Your call stays active if you cannot board.' : 'Your arrival estimate updates live.'}</p><button className="p-cancel" disabled={locked || committed} onClick={() => void command('cancel', { id: request.id })}>Cancel my request</button>{committed && <p className="p-lock-note">Your pickup is committed. Cancellation is no longer available.</p>}</>}
      </section> : <section className="p-ready" aria-live="polite"><span className="p-ready-icon">↕</span><h2>{last?.status === 'cancelled' ? 'Request cancelled' : last?.status === 'completed' ? 'You’ve arrived.' : 'Just choose your direction.'}</h2><p>We’ll take care of the lift.<br />A simpler journey starts here.</p></section>}

      <button className="p-details-trigger" onClick={() => details.current?.showModal()}><span>Lift details</span><span aria-hidden="true">↗</span></button>
      <p className="p-estimate-note">Capacity predictions are estimates, not boarding guarantees.</p>
      <div className="p-bottom-action"><p>{request ? 'Your journey updates automatically.' : 'Your direction. The right lift. Zero fuss.'}</p><button className="p-primary" disabled={locked || !!request} onClick={() => callSheet.current?.showModal()}>{pending ? 'Requesting your lift…' : request ? request.status === 'onboard' ? 'Journey underway' : 'Lift requested' : 'Call a lift'}<span aria-hidden="true">→</span></button><small>ZeroWait · A little less waiting.</small></div>
    </main>

    <dialog ref={callSheet} className="p-details-sheet p-call-sheet" aria-labelledby="p-call-title"><div className="p-sheet-inner"><header><div><p>LET’S GET YOU THERE</p><h2 id="p-call-title">Which direction are you going?</h2></div><button aria-label="Close direction sheet" onClick={() => callSheet.current?.close()}>×</button></header><p className="p-sheet-note">{floor === null ? 'Select your demo floor before calling a lift.' : `Demo Floor ${String(floor).padStart(2, '0')} · Your lift is assigned automatically.`}</p>{floor === null && floorPicker}{error && <p role="alert" className="p-feedback">{error}</p>}<div className="p-call-directions"><button disabled={locked || !!request || floor === null || floor === state.config.floors} onClick={() => void submit('UP')}><span>↑</span>Going Up</button><button disabled={locked || !!request || floor === null || floor === 1} onClick={() => void submit('DOWN')}><span>↓</span>Going Down</button></div><p role="status" className="p-sheet-note">{pending ? 'Requesting your lift…' : floor === 1 ? 'You’re at the lowest floor. Choose UP.' : floor === state.config.floors ? 'You’re at the top floor. Choose DOWN.' : 'Tap a direction to call. No extra steps.'}</p></div></dialog>
    <dialog ref={locationSheet} className="p-details-sheet" aria-labelledby="p-location-title"><div className="p-sheet-inner"><header><h2 id="p-location-title">Demo location</h2><button aria-label="Close demo location" onClick={() => locationSheet.current?.close()}>×</button></header><p className="p-sheet-note">This is a simulated floor for testing. Indoor positioning is not connected.</p>{floorPicker}<button className="p-primary p-location-done" onClick={() => locationSheet.current?.close()}>Done</button></div></dialog>
    <dialog ref={details} className="p-details-sheet" aria-labelledby="p-details-title"><div className="p-sheet-inner"><header><div><p>YOUR PICKUP FLOOR</p><h2 id="p-details-title">Lift details</h2></div><button aria-label="Close lift details" onClick={() => details.current?.close()}>×</button></header>
      {origin === null ? <p className="p-sheet-note">Set your demo floor to see its lift details.</p> : <>
        <p className="p-sheet-note">Floor {String(origin).padStart(2, '0')}{request ? ` · Going ${request.direction.toLowerCase()}` : ''}. Only arrivals at your pickup floor are shown.</p>
        <div className="p-floor-waiting"><span>Observed waiting on this floor <small>Both directions · live lobby observation</small></span><strong data-testid="floor-waiting">{state.lobbies.find(lobby => lobby.floor === origin)?.observation.count ?? '—'}{(state.lobbies.find(lobby => lobby.floor === origin)?.observation.uncertainty ?? 0) > 0 && <small> ±{state.lobbies.find(lobby => lobby.floor === origin)?.observation.uncertainty}</small>}</strong></div>
        {state.cars.map(car => {
          const stops = car.stops.filter(stop => !stop.serviced && stop.floor === origin && (!request || stop.direction === request.direction) && (car.id !== request?.assignedElevator || stop.pickupIds.includes(request.id)));
          return <section className="p-floor-lift" key={car.id} aria-label={`${car.id} pickup details`}><header><h3>{car.id}</h3>{car.id === request?.assignedElevator && <span>Assigned to you</span>}</header>
            {stops.length ? stops.map(stop => {
              const tone = stop.availability === 'Likely full' ? 'full' : stop.availability === 'Uncertain' || stop.spaces < 2 || car.observation.uncertainty > 0 ? 'limited' : 'comfortable';
              const label = tone === 'full' ? 'Likely full' : tone === 'limited' ? 'Limited space' : 'Comfortable';
              return <div className="p-floor-arrival" data-testid="floor-arrival" key={stop.key}><div><span>{car.id === request?.assignedElevator ? 'Your pickup' : 'Scheduled arrival'} · Floor {String(stop.floor).padStart(2, '0')}</span><b>{Number.isFinite(stop.eta) ? stop.eta <= 0 ? 'Arriving now' : `${Math.ceil(stop.eta)} seconds` : 'Replanning'}</b><small>{stop.direction === 'UP' ? '↑ Going up' : stop.direction === 'DOWN' ? '↓ Going down' : 'Standing by'}</small></div><span className={`p-capacity p-capacity-pill ${tone}`}><i />{label}</span></div>;
            }) : <p className="p-sheet-note">{car.id === request?.assignedElevator ? request.status === 'onboard' ? 'Your pickup is complete.' : 'Replanning your pickup.' : 'No scheduled arrival for your floor' + (request ? ' in your direction.' : '.')}</p>}
          </section>;
        })}
        <p className="p-sheet-note">Capacity colors describe predicted boarding space at this floor, not the number of people inside. Blue: Comfortable · Amber: Limited space · Red: Likely full. Estimates may change.</p>
      </>}
    </div></dialog>
  </div>;
}
