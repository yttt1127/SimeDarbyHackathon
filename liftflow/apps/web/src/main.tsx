import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CarView, Snapshot } from '../../../packages/shared/types';
import { useLive } from './live';
import './style.css';
import { PassengerApp } from './PassengerApp';

const arrow = (direction: string) => direction === 'UP' ? '↑' : direction === 'DOWN' ? '↓' : '—';
const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const eta = (seconds: number) => seconds <= 0 ? 'Now' : `${Math.ceil(seconds)}s`;
type Command = (path: string, data: unknown) => Promise<boolean>;
function Mark({ small = false }: { small?: boolean }) {
  return <span className={`mark ${small ? 'small' : ''}`} aria-hidden="true"><span>↑</span><span>↓</span></span>;
}
function App() {
  const live = useLive();
  const [view, setView] = useState(location.pathname === '/dashboard' ? 'dashboard' : 'passenger');
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const commandPending = useRef(false);
  const lastTraffic = useRef(-Infinity);
  const command: Command = async (path, data) => {
    if (commandPending.current || (path === 'traffic' && performance.now() - lastTraffic.current < 600)) return false;
    commandPending.current = true;
    if (path === 'traffic') lastTraffic.current = performance.now();
    setBusy(true);
    try { const ok = await live.command(path, data); if (!ok && path === 'traffic') lastTraffic.current = -Infinity; return ok; } finally { commandPending.current = false; setBusy(false); }
  };
  useEffect(() => {
    const listener = () => setView(location.pathname === '/dashboard' ? 'dashboard' : 'passenger');
    window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener);
  }, []);
  const navigate = (next: string) => { setView(next); history.pushState({}, '', next === 'passenger' ? '/' : '/dashboard'); };
  const state = live.state;
  if (view === 'passenger') return state ? <PassengerApp state={state} session={live.session} connected={live.connected} busy={busy} error={live.error} command={command} onDashboard={() => navigate('dashboard')} /> : <div className="loading"><Mark /><h2>Connecting ZeroWait…</h2></div>;
  return <div className="app-shell">
    <aside className="sidebar">
      <a href="/dashboard" onClick={e => { e.preventDefault(); navigate('dashboard'); }} className="brand"><Mark /><span>liftflow<span className="brand-dot">.</span></span></a>
      <div className="workspace-label">BUILDING INTELLIGENCE</div>
      <nav aria-label="Main navigation">
        <button className={view === 'dashboard' ? 'nav active' : 'nav'} onClick={() => navigate('dashboard')}><span>▦</span> Building overview <span className="nav-arrow">↗</span></button>
        <button className={view === 'passenger' ? 'nav active' : 'nav'} onClick={() => navigate('passenger')}><span>↕</span> Passenger app <span className="nav-arrow">↗</span></button>
      </nav>
      <div className="sidebar-note"><span className="tiny-label">THE VIRTUAL BUILDING</span><strong>One building.<br />Every journey connected.</strong><p>Live movement, visible capacity and a clearer way up.</p><div className="mini-building">{Array.from({ length: 7 }, (_, i) => <span key={i} />)}</div></div>
      <div className="sidebar-bottom"><span className="dot" /> Local simulation <span className="version">V0.2</span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div><span className="building-icon">▥</span><strong>Northline Tower</strong><span className="topbar-divider" /> <span>Virtual building</span></div><div className={`connection ${live.connected ? '' : 'offline'}`}><span className="dot" /> {live.connected ? 'Live connection' : 'Reconnecting'}</div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">LIFTFLOW / {view === 'dashboard' ? 'CONTROL CENTRE' : 'YOUR JOURNEY'}</div><h1>{view === 'dashboard' ? 'A better view of every lift.' : 'Your next ride, in view.'}</h1><p>{view === 'dashboard' ? 'Follow the movement. Understand the capacity. Keep people moving.' : 'Choose your floor and we’ll find a lift for your journey.'}</p></div><span className="prototype-badge">SIMULATION PROTOTYPE <span>↗</span></span></div>
        {live.error && <div className="error" role="alert">{live.error}<button aria-label="Dismiss error" onClick={() => live.setError('')}>×</button></div>}
        {live.feedback && <div className="notice" role="status">{live.feedback}</div>}
        {!live.connected && state && <div className="warning">Connection lost. Displayed state is stale; controls are disabled until reconnection.</div>}
        {!state ? <div className="loading"><Mark /><h2>Connecting your building…</h2><p>Waiting for the authoritative simulator state.</p></div> :
          <fieldset className="app-fieldset" disabled={!live.connected || busy}>
            {view === 'dashboard' ? <>
              <Stats state={state} />
              <div className="dashboard-grid">
                <section className="panel building-panel"><PanelTitle eyebrow="REAL-TIME POSITION" title="The building at a glance" extra={<span className="subtle-badge">{state.config.floors} FLOORS</span>} /><Building state={state} /><div className="legend"><span><i className="legend-dot green" /> Lift A</span><span><i className="legend-dot blue" /> Lift B</span><span>● Waiting passengers</span></div></section>
                <section className="panel operations"><PanelTitle eyebrow="SIMULATION" title="You’re in control" extra={<span className={`status-dot ${state.running ? 'on' : ''}`} />} /><Controls state={state} command={command} onAdd={() => setAddOpen(true)} /></section>
              </div>
              <div className="section-heading"><div><h2>Every stop. The full picture.</h2><p>Live route plans with arrival estimates and capacity forecasts.</p></div><span className="subtle-badge">OBSERVED + PREDICTED</span></div>
              <div className="lift-grid">{state.cars.map((car, i) => <LiftPanel key={car.id} car={car} index={i} state={state} />)}</div>
            </> : null}
          </fieldset>}
        <footer><span>Liftflow <b>V0.2</b> · A functional simulation, one floor at a time.</span><span>Passenger-count prototype, not a certified physical load rating.</span></footer>
      </main>
    </div>
    {addOpen && state && <AddPassenger floors={state.config.floors} error={live.error} connected={live.connected} command={command} close={() => setAddOpen(false)} />}
  </div>;
}
function PanelTitle({ eyebrow, title, extra }: { eyebrow: string; title: string; extra?: React.ReactNode }) {
  return <div className="panel-title"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>{extra}</div>;
}
function Stats({ state }: { state: Snapshot }) {
  const waiting = state.requests.filter(r => r.status === 'waiting').length;
  const riding = state.cars.reduce((sum, c) => sum + c.actualOccupancy, 0);
  const completed = state.requests.filter(r => r.status === 'completed').length;
  const congested = state.lobbies.filter(l => l.actual > state.config.boardingLimit).length;
  return <div className="stats">
    {[['↕', 'Elevators online', state.cars.length.toString().padStart(2, '0'), `${state.cars.filter(c => c.phase !== 'IDLE').length} serving passengers`],
      ['◷', 'Waiting to ride', waiting.toString().padStart(2, '0'), congested ? `${congested} congested ${congested === 1 ? 'floor' : 'floors'}` : 'Across all floors'],
      ['♙', 'Passengers onboard', riding.toString().padStart(2, '0'), 'Simulator ground truth'],
      ['✓', 'Journeys completed', completed.toString().padStart(2, '0'), 'Since the last reset']].map(([icon, label, value, note]) =>
      <div className="stat" key={label}><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><span className="stat-note">{note}</span></div>)}
  </div>;
}
function Building({ state }: { state: Snapshot }) {
  return <div className="building" style={{ '--cars': state.cars.length } as React.CSSProperties}>
    <div className="building-labels"><span>FLOOR</span><span>LIFT SHAFTS</span><span>WAITING</span></div>
    <div className="building-body">
      <div className="floor-grid">{[...state.lobbies].reverse().map(lobby => <div className={`floor-row ${lobby.actual > state.config.boardingLimit ? 'congested' : ''}`} key={lobby.floor}><span className="floor-label">{lobby.floor.toString().padStart(2, '0')}<small>{lobby.floor === 1 ? 'LOBBY' : ''}</small></span><div className="floor-line" /><span className="waiting-count" title={`Actual queue: ${lobby.actual}; observed: ${lobby.observation.count} ± ${lobby.observation.uncertainty}`}>{lobby.actual ? <><i />{lobby.actual}</> : <span className="empty-queue">—</span>}</span></div>)}</div>
      <div className="shafts">{state.cars.map((car, i) => <div className="shaft" key={car.id}><div className={`elevator-car car-${i % 2} ${['OPENING', 'BOARDING'].includes(car.phase) ? 'doors-open' : ''}`} style={{ bottom: `calc(${(car.position - 1) / state.config.floors * 100}% + ${(100 / state.config.floors) / 2}% - 19px)` }} aria-label={`${car.id} at floor ${car.position.toFixed(1)}, ${car.phase}`}><span>{String.fromCharCode(65 + i)}</span><b>{arrow(car.direction)}</b><i /><i /></div></div>)}</div>
    </div>
    <div className="building-ground"><span>GROUND LEVEL</span><span>POSITION · SIMULATOR TRUTH</span></div>
  </div>;
}
function Controls({ state, command, onAdd }: { state: Snapshot; command: Command; onAdd: () => void }) {
  const [scenario, setScenario] = useState('capacity');
  return <div className="controls">
    <div className="sim-clock"><div><span className="tiny-label">SIMULATED TIME</span><strong data-testid="sim-clock">{clock(state.now)}<small>.{Math.floor(state.now % 1 * 10)}</small></strong></div><span className="subtle-badge">{state.running ? 'RUNNING' : 'PAUSED'}</span></div>
    <div className="control-buttons"><button className="primary" onClick={() => void command('control', { action: state.running ? 'pause' : 'start' })}>{state.running ? 'Ⅱ Pause' : '▶ Start / resume'}</button><button className="secondary" onClick={() => void command('control', { action: 'step' })}>+1s Step</button><button className="square secondary" title="Reset simulation" aria-label="Reset simulation" onClick={() => void command('control', { action: 'reset' })}>↺</button></div>
    <label className="inline-label">Playback speed<select aria-label="Playback speed" value={state.speed} onChange={e => void command('control', { action: state.running ? 'resume' : 'pause', speed: Number(e.target.value) })}>{[0.5, 1, 2, 4, 8].map(speed => <option key={speed} value={speed}>{speed}× speed</option>)}</select></label>
    <div className="divider" />
    <div className="tiny-label">MAKE IT MOVE</div>
    <p className="traffic-status" role="status"><strong data-testid="pending-arrivals">{state.pendingArrivals ?? 0}</strong> scheduled arrivals pending · {state.running ? 'arriving over time' : 'paused'}<br /><small>Generate traffic starts the simulator. Pause stops future arrivals.</small></p>
    <div className="control-buttons"><button className="secondary" onClick={onAdd}>＋ Add passengers</button><button className="secondary" onClick={() => void command('traffic', { count: 8, pattern: 'off-peak' })}>↗ Generate traffic</button></div>
    <div className="scenario-box"><span className="tiny-label">DEMONSTRATION SCENARIO</span><div className="scenario-select"><select aria-label="Demonstration scenario" value={scenario} onChange={e => setScenario(e.target.value)}><option value="capacity">01 — Capacity switch</option><option value="morning">02 — Morning · down-peak</option><option value="evening">03 — Evening · up-peak</option><option value="off-peak">04 — Off-peak residential</option><option value="heavy">05 — Heavy residential traffic</option></select><button className="primary" onClick={() => void command('scenario', { name: scenario })}>Load</button></div><p>{scenario === 'capacity' ? 'A real boarding surge changes which lift is the better choice.' : 'Seeded residential arrivals over simulated time. Press Start to run.'}</p></div>
    <details className="demo-guide"><summary>Run the capacity demonstration <span>↗</span></summary><ol><li>Load “Capacity switch” (resets the simulation).</li><li>Open ZeroWait. Use Demo Floor 04, call a lift and choose UP.</li><li>Keep the simulation paused. Add the lobby surge below.</li><li>Watch ZeroWait update the assignment after a full-load bypass, then resume.</li></ol><button className="secondary full" onClick={() => void command('scenario', { name: 'surge' })}>Add lobby surge &amp; advance 2s</button></details>
  </div>;
}
function LiftPanel({ car, index, state }: { car: CarView; index: number; state: Snapshot }) {
  return <section className={`panel lift-panel lift-${index % 2}`} data-testid={`lift-${index}`}>
    <div className="lift-header"><div className="lift-identity"><div className="lift-letter">{String.fromCharCode(65 + index)}</div><div><h2>{car.id}</h2><span>{car.phase === 'IDLE' ? 'Standing by' : car.phase === 'MOVING' ? `Moving ${car.direction.toLowerCase()}` : `${car.phase.toLowerCase()} · floor ${Math.round(car.position)}`}</span></div></div><div className="current-floor"><small>CURRENT FLOOR</small><strong>{car.position.toFixed(car.phase === 'MOVING' ? 1 : 0)} <span>{arrow(car.direction)}</span></strong></div></div>
    <div className="occupancy-line"><span>Observed occupancy <b>{car.observation.count}</b><span className="muted"> ± {car.observation.uncertainty} people</span></span><span className="actual-label">Actual: {car.actualOccupancy}</span></div>
    <div className="capacity-meter"><span style={{ width: `${Math.min(100, car.observation.count / state.config.boardingLimit * 100)}%` }} /></div>
    <div className="capacity-caption"><span>Simulated capacity: {state.config.boardingLimit} people</span><span>Observed at {clock(car.observation.timestamp)}</span></div>
    <div className="route-title"><span>COMPLETE UPCOMING ROUTE</span><b>{car.stops.length} {car.stops.length === 1 ? 'stop' : 'stops'}</b></div>
    {car.stops.length === 0 ? <div className="empty-route"><span>↕</span><strong>Ready for the next journey</strong><p>No scheduled stops. Add a passenger or request a lift.</p></div> :
      <div className="stop-list">{car.stops.map((stop, i) => <div className={`stop-item ${stop.availability === 'Likely full' ? 'full-stop' : ''}`} key={stop.key} data-testid="scheduled-stop">
        <div className="stop-main"><div className="stop-number">{i + 1}</div><div className="stop-floor"><strong>Floor {stop.floor} <span>{arrow(stop.direction)}</span></strong><span>{stop.pickupIds.length ? `Pickup ${stop.pickupIds.length}` : ''}{stop.pickupIds.length && stop.dropoffIds.length ? ' · ' : ''}{stop.dropoffIds.length ? `Drop-off ${stop.dropoffIds.length}` : ''}{!stop.pickupIds.length && !stop.dropoffIds.length ? 'Committed service' : ''}{stop.committed ? ' · locked' : ''}</span></div><div className="stop-eta"><strong>{eta(stop.eta)}</strong><span>at {clock(stop.arrivalAt)}</span></div></div>
        <div className="prediction-grid"><div><span>Arriving</span><b>{stop.arriving}</b></div><div><span>Exit / board</span><b>−{stop.exits} / +{stop.boarding}</b></div><div><span>Before board</span><b>{stop.beforeBoarding}</b></div><div><span>After stop</span><b>{stop.after}</b></div><div><span>Free spaces</span><b>{stop.spaces}</b></div></div>
        <div className="stop-bottom"><span className={`availability ${stop.availability === 'Likely full' ? 'warn' : stop.availability === 'Uncertain' ? 'uncertain' : ''}`}>● {stop.availability}</span><span title={[...stop.pickupIds, ...stop.dropoffIds].join(', ')}>{stop.waiting} waiting</span></div>
        {stop.serviced && <p className="small-note">Service underway. Boarding/exiting is already reflected in the current counts above.</p>}
        <details className="stop-references"><summary>Service references</summary><span>Pickup: {stop.pickupIds.join(', ') || '—'} · Drop-off: {stop.dropoffIds.join(', ') || '—'}</span></details>
      </div>)}</div>}
    <div className="prediction-note">Forecasts use observed counts and known calls. Waiting destinations are unknown; predicted boarders remain in later estimates.</div>
  </section>;
}
function AddPassenger({ floors, command, close, error, connected }: { floors: number; command: Command; close: () => void; error: string; connected: boolean }) {
  const [origin, setOrigin] = useState(1), [destination, setDestination] = useState(floors), [count, setCount] = useState(1);
  const [sending, setSending] = useState(false);
  const pending = useRef(false);
  const [validation, setValidation] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending.current || !connected) return;
    if (![origin, destination, count].every(Number.isInteger) || origin < 1 || origin > floors || destination < 1 || destination > floors || count < 1 || count > 100 || origin === destination) {
      setValidation(`Choose distinct floors from 1 to ${floors} and a whole passenger count from 1 to 100.`); return;
    }
    setValidation(''); pending.current = true; setSending(true);
    try { if (await command('passengers', { origin, destination, count })) close(); }
    finally { pending.current = false; setSending(false); }
  };
  return <div className="modal-backdrop"><section className="panel modal" role="dialog" aria-modal="true" aria-labelledby="add-title"><button className="close-modal" onClick={close} aria-label="Close dialog">×</button><div className="eyebrow">CREATE A JOURNEY</div><h2 id="add-title">People make the building move.</h2><p>Passengers join the waiting queue immediately, even while paused.</p><form noValidate onSubmit={submit}><div className="settings-grid"><label>Origin floor<input autoFocus type="number" min={1} max={floors} value={origin} onChange={e => setOrigin(Number(e.target.value))} required /></label><label>Destination floor<input type="number" min={1} max={floors} value={destination} onChange={e => setDestination(Number(e.target.value))} required /></label><label>Passengers<input type="number" min={1} max={100} value={count} onChange={e => setCount(Number(e.target.value))} required /></label></div>{(validation || error) && <p className="warning" role="alert">{validation || error}</p>}{!connected && <p role="status">Reconnecting. Please wait before adding passengers.</p>}<button disabled={sending || !connected} className="primary full">{sending ? 'Adding passengers…' : `Add ${count} ${count === 1 ? 'passenger' : 'passengers'}`}</button></form></section></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
