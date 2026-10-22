# Liftflow · V0.1

A live elevator traffic prototype: React dashboard and ZeroWait mobile passenger app, backed by one authoritative discrete-event simulator. It can run locally or as a public demonstration service. No physical controls or comparative benchmarks are included.

## Run locally

Use Node.js 22 or newer and npm. From this directory:

```powershell
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:3001** for the dashboard, or **http://127.0.0.1:3001/passenger** for the passenger app. Both views also have navigation buttons. With no public environment settings, the server binds to loopback only and operator controls remain available for local demonstrations.

For development:

```powershell
npm run dev
```

Open **http://127.0.0.1:5173**. Vite proxies API/WebSocket traffic to port 3001. Stop an existing `npm start` process before using `npm run dev`, as both use the same backend port. Close the process with Ctrl+C.

## Render web service setup

The repository root contains `liftflow/`; `package.json` is inside that directory. In the **existing** Render web service, set:

| Setting | Value |
| --- | --- |
| Repository | `yttt1127/hackathon` |
| Branch | `main` |
| Runtime / Language | Node.js |
| Root Directory | `liftflow` |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Node version | Node.js 22 or newer (`NODE_VERSION=22` if the service does not already use it) |

Set **Root Directory** in the Render dashboard. A GitHub commit alone does not change an existing service's root setting. Render supplies `PORT`, `RENDER` and `RENDER_EXTERNAL_URL`; `PORT` selects the listener, and the exact HTTPS origin in `RENDER_EXTERNAL_URL` is accepted for browser HTTP and WebSocket connections. You do not need to hardcode the Render URL or port. If using an additional custom HTTPS origin, set `LIFTFLOW_PUBLIC_ORIGIN` to that origin. The server rejects all other browser origins. Public mode requires an HTTPS origin, but no operator password.

Render terminates HTTPS; the app's browser code chooses `wss://` on HTTPS and `ws://` on HTTP. The frontend uses same-origin `/api` and `/ws` paths. The dashboard and passenger app have no password screen. **Warning:** the public site uses one shared simulation, and any visitor can reset it, change settings or interrupt another visitor's demonstration. This must not be used to operate a real building.

If using Render's Free web service, the service can spin down after 15 minutes without inbound traffic and may take about a minute to wake. Simulation state, requests and session grants live only in memory, so a spin-down, restart or redeploy resets them. The Free plan also has usage limits and no persistent disk. Confirm the service's **Deploys** page shows a successful deploy; a GitHub push alone does not verify the site. See [Render's free-service limits](https://render.com/docs/free) and [monorepo root-directory guidance](https://render.com/docs/monorepo-support).

## What works

- Configurable building (default 10 floors, 2 lifts, 4 seconds per floor, 8 seconds per stop).
- Discrete motion/door events, continuous displayed position, individual passenger lifecycles, hall calls and registered onboard destination calls.
- Complete directional stop sequences, including repeated floor visits, per-stop ETA, pickup/drop-off references and commitment status.
- One shared state over WebSocket, with reconnect and stale-state handling.
- Dashboard: animated building, actual queues, congestion highlights, lift panels, event log, controls and model settings.
- ZeroWait passenger app: informational lift overview, simulated demo floor with a small adjustment sheet, direction-first calls, automatic assignment, live pickup ETA and estimated capacity, and own-request cancellation. No manual lift selection or alternative-acceptance UI.
- Replaceable mock camera with observation time and optional deterministic error; independent capacity forecasts and uncertainty.
- Capacity-aware candidate insertion and scoring; stable assignments without automatic switching.
- Real boarding-driven alternative scenario, seeded mixed traffic and morning arrivals.
- Timestamped event history, available at `/api/events`. UI shows the most recent 120 events; full history remains in memory until reset.

All stops remain accessible; ZeroWait places its complete routes in the optional Lift details sheet. Long routes extend vertically. Both views use the same live route component. Actual occupancy is labelled separately from observed counts and forecast values. On a stop already in service, ETA is “Now” and values reflect the current service phase.

## Live demonstration: capacity switch

1. On the dashboard, choose **01 — Capacity switch** and click **Load**. This resets to defaults and physically boards one passenger into Lift A at floor 1. Time is paused at 2 seconds.
2. Open **Passenger app**. Use **Demo Floor 04**, tap **Call a lift**, then **Going Up**. The assignment algorithm selects **Lift B** because its initial pickup estimate is earlier.
3. Leave the simulation paused. Click **Add lobby surge & advance 2s** under the dashboard’s capacity demonstration guide.
4. Ten new passengers request travel from floor 1 to 10. Normal assignment and boarding logic places them into B. B reaches its simulated boarding limit; predictions now show insufficient space at floor 4.
5. ZeroWait displays **Likely full** for the assigned pickup. The assignment stays with B; the request remains active if boarding is deferred. The alternative/reassignment API remains available for future work, but is not exposed to passengers.
6. Return to the dashboard and click **Start / resume**. Watch the passenger board, register their synthetic destination and complete their journey.

This scenario does not set occupancy directly, override assignments, force recommendations, or animate predetermined results. It creates ordinary passengers and advances the normal event engine. A regression test also adds another passenger at floor 4 and verifies that their B pickup is preserved after the first passenger switches.

The scenario requires a fresh default setup and a floor 4 UP request at simulated time 2. The surge command rejects an incompatible state with instructions to reload it.

## ZeroWait prototype scope

The default Demo Floor 04 is an explicit simulated location, not indoor positioning. Change opens a testing-only floor selector. If the demo floor is unset or invalidated by a building configuration change, a floor must be selected before submitting UP/DOWN. No physical floor is inferred from IP addresses or ports.

Before a direction is selected, pickup ETA and capacity stay neutral. After a call, the assigned ETA is read from the server stop containing that request ID, never the next unrelated stop. If that pickup is unavailable, ZeroWait shows a waiting/replanning state. Capacity is an estimate, not a boarding guarantee. Cancellation remains subject to the existing committed-stop safety checks.

The passenger screen retains the latest dark overview, elevator illustrations and orange CTA. Backend algorithms, API paths and Render commands are unchanged. This release preserves the newer passwordless shared-demo configuration already on GitHub; all visitors can operate the simulator. Deploying this UI does not add real positioning, cameras, persistence or production access control.

## Verification

```powershell
npm test
npm run build
npm run test:browser
node tests/production-smoke.mjs
```

- Vitest covers the simulator, scheduling, ETA, information boundaries, prediction, ownership, live propagation and end-to-end API scenario.
- Playwright launches headless Microsoft Edge and uses the production build. If no server is running, it starts one automatically.
- Browser checks cover desktop and 375/390 px mobile widths, complete routes in two independent sessions, automatic assignment, pickup-specific ETA/capacity, missing-floor fallback, invalid directions, duplicate-call locking, API-error retry, manual creation, cancellation, stepping, pausing, and JavaScript errors.
- The production-style smoke script starts a temporary public-mode server on an environment-defined port with a synthetic HTTPS origin without any operator password. It checks both pages, assets, API state, live WebSocket updates, passenger requests, origin rejection and passwordless controls without contacting Render.
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

Data is in memory. Reset, applying settings, or restarting the server clears simulation data. A browser session can change only its own passenger requests. The public hackathon demo has no operator authentication. Every visitor can change the shared simulation; this is not a production security model.
