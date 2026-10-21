# Liftflow · V0.1

A local, live elevator traffic prototype: React dashboard and mobile passenger app, backed by one authoritative discrete-event simulator. No accounts, paid services, cloud deployment, physical controls or comparative benchmarks.

## Run locally

Use Node.js 22 or newer and npm. From this directory:

```powershell
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:3001** for the dashboard, or **http://127.0.0.1:3001/passenger** for the passenger app. Both views also have navigation buttons. The server binds to loopback only.

For development:

```powershell
npm run dev
```

Open **http://127.0.0.1:5173**. Vite proxies API/WebSocket traffic to port 3001. Stop an existing `npm start` process before using `npm run dev`, as both use the same backend port. Close the process with Ctrl+C.

## What works

- Configurable building (default 10 floors, 2 lifts, 4 seconds per floor, 8 seconds per stop).
- Discrete motion/door events, continuous displayed position, individual passenger lifecycles, hall calls and registered onboard destination calls.
- Complete directional stop sequences, including repeated floor visits, per-stop ETA, pickup/drop-off references and commitment status.
- One shared state over WebSocket, with reconnect and stale-state handling.
- Dashboard: animated building, actual queues, congestion highlights, lift panels, event log, controls and model settings.
- Passenger app: manual floor selection, UP/DOWN calls, own-request cancellation, assignment explanation, approaching/full notices and explicit alternative acceptance.
- Replaceable mock camera with observation time and optional deterministic error; independent capacity forecasts and uncertainty.
- Capacity-aware candidate insertion and scoring; stable assignments without automatic switching.
- Real boarding-driven alternative scenario, seeded mixed traffic and morning arrivals.
- Timestamped event history, available at `/api/events`. UI shows the most recent 120 events; full history remains in memory until reset.

All stops remain visible in the page; long routes extend vertically. Both views use the same live route component. Actual occupancy is labelled separately from observed counts and forecast values. On a stop already in service, ETA is “Now” and values reflect the current service phase.

## Live demonstration: capacity switch

1. On the dashboard, choose **01 — Capacity switch** and click **Load**. This resets to defaults and physically boards one passenger into Lift A at floor 1. Time is paused at 2 seconds.
2. Open **Passenger app**. Choose **floor 4**, then **Going up**. The assignment algorithm selects **Lift B** because its initial pickup estimate is earlier.
3. Leave the simulation paused. Click **Add lobby surge & advance 2s** in the passenger app (also available under the dashboard guide).
4. Ten new passengers request travel from floor 1 to 10. Normal assignment and boarding logic places them into B. B reaches its simulated boarding limit; predictions now show insufficient space at floor 4.
5. The scoring algorithm recommends **Lift A**. Click **Accept Lift A**. The passenger's pickup moves to A; B's unused floor 4 stop disappears, while its ten onboard floor 10 drop-offs remain.
6. Return to the dashboard and click **Start / resume**. Watch the passenger board, register their synthetic destination and complete their journey.

This scenario does not set occupancy directly, override assignments, force recommendations, or animate predetermined results. It creates ordinary passengers and advances the normal event engine. A regression test also adds another passenger at floor 4 and verifies that their B pickup is preserved after the first passenger switches.

The scenario requires a fresh default setup and a floor 4 UP request at simulated time 2. The surge command rejects an incompatible state with instructions to reload it.

## Verification

```powershell
npm test
npm run build
npm run test:browser
```

- Vitest covers the simulator, scheduling, ETA, information boundaries, prediction, ownership, live propagation and end-to-end API scenario.
- Playwright launches headless Microsoft Edge and uses the production build. If no server is running, it starts one automatically.
- Browser checks cover desktop and 375/390 px mobile widths, complete routes in two independent sessions, the alternative flow, manual creation, cancellation, stepping, pausing, and JavaScript errors.
- Browser tests reset the local simulation. Do not run them during a live demonstration.
- If Edge is unavailable, install Playwright Chromium (`npx playwright install chromium`) and remove `channel: 'msedge'` from `playwright.config.ts`.

See [verification notes](docs/verification.md), [architecture](docs/architecture.md), [algorithm assumptions](docs/algorithms.md), and [known limitations](docs/limitations.md).

## Project map

```text
apps/server/          HTTP validation, sessions, WebSocket broadcast, static serving
apps/web/src/         dashboard, passenger UI, shared lift display, live client
packages/shared/     typed state, forecasts and events
packages/simulation/ authoritative clock, passengers, physical transitions
packages/scheduling/ directional policy, candidate insertion and assignment
packages/prediction/ ETA and occupancy forecasting from restricted knowledge
packages/sensors/    replaceable observation interface and mock camera
tests/               deterministic functional and API integration tests
tests/browser/       real-browser interaction and synchronization tests
docs/                architecture, assumptions, limitations and screenshots
```

Data is in memory. Reset, applying settings, or restarting the server clears simulation data. A browser session can change only its own passenger requests; operator controls are deliberately shared for this local demo. This is not a deployed or authenticated building-management service.
