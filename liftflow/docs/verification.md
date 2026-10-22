# ZeroWait V0.2 verification · 23 October 2026

- `npm test`: 34 passing tests across five files.
- `npm run build`: TypeScript checks and Vite production build passed.
- `npm run test:browser`: five passing Edge browser workflows, including passenger default/alias routes and physical fractional movement with integer display.
- `node tests/production-smoke.mjs`: Render-style host/port, `/`, `/passenger`, `/dashboard`, static assets, API, WebSocket, origin and session checks passed.
- Direct simulation smoke: Morning 30/30, Evening 30/30, Off-peak 30/30 and Heavy 80/80 completed after a bounded 1,200 simulated seconds; zero remaining queues and all cars idle. These are functional checks, not performance measurements.

## Focused behavior

V0.2 tests cover consolidation of six previously split floor-7 DOWN requests into one visit, overflow demand requiring multiple cars, full-load pickup bypass, retained waiting requests, mandatory floor-8 drop-offs, subsequent service after exits, comfort versus hard boarding limit, conservative handling of uncertainty, commitment under changed observations, independent forecast boarding slots, timed seeded residential distributions, configurable shares and two-floor buildings. Bounded heavy traffic runs across three seeds verify queue retention, no duplicate boarding and eventual completion after demand stops.

Existing cancellation, ownership, movement/ETA, ordering, information-boundary, sensor, session and WebSocket tests remain. The old deterministic surge integration test now asserts automatic bypass/reassignment, as required by V0.2. Legacy explicit-alternative tests use a small uncertain observation fixture to preserve coverage of that API when conservative automatic bypass is intentionally disabled; their ownership and other-request preservation assertions remain.

## Passenger checks

The browser suite verifies current floor/direction, complete compact stop sequences, current-versus-pickup capacity labels, frame capacity classes, lobby waiting counts, backend automatic assignment and subsequent reassignment, accurate pickup ETA, simplified route details, cancellation, missing demo floor, invalid directions, duplicate prevention, error retry, dashboard controls, and document widths from 320 to 1440 pixels. Screenshots were visually inspected for the mobile overview and details.

Artifacts: [overview](screenshots/passenger-redesign.png), [assignment](screenshots/passenger.png), [automatic service update](screenshots/passenger-capacity.png), [direction sheet](screenshots/passenger-direction.png), [simplified full routes](screenshots/passenger-floor-details.png).

No real camera, physical device, live Render deployment or real-world performance benchmark was verified. Test servers shut down after browser verification. Render settings and same-origin HTTP/WebSocket paths are retained.
