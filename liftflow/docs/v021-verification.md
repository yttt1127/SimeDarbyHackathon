# ZeroWait V0.2.1 verification

## Confirmed causes

Reproduced on the actual V0.2 dashboard before editing:
- Manual Add passengers returned HTTP 200 and immediately created two waiting requests while paused, with pickup stops. Healthy local manual creation itself was not broken.
- Generate traffic returned HTTP 200 but left simulation time at zero and running=false. Arrivals were scheduled privately, with no pending-arrival field or visible acknowledgement.
- A rejected manual request showed its error behind the open modal, not inside it. Command-time 401 responses were not renewed; corrupt stored session JSON prevented connection recovery.

## Changes

- Expose pendingArrivals in snapshots and live dashboard; traffic generation resumes the simulator and returns explicit scheduled-count feedback.
- Preserve immediate manual creation, return created-count feedback, and show validation/backend errors inside the form.
- Lock pending commands synchronously and suppress accidental rapid duplicate traffic clicks.
- Recover corrupt/expired sessions, retry only an authentication-rejected command once, bound network waits, and reconnect to authoritative WebSocket state. Never replay a timeout with an unknown mutation outcome.
- No changes to capacity assignment or residential distributions.

## Verification

- npm run build (includes tsc --noEmit): passed.
- npm test: 35 tests passed across five files. Local network integration tests require network-enabled execution; the sandbox-only attempt could not fetch localhost.
- npm run test:browser: 10 dashboard/passenger browser tests, including manual creation while paused, traffic progression, duplicate prevention, pause/resume, reset, visible invalid/backend errors, corrupt storage, command-time 401, and a real server restart.
- node tests/production-smoke.mjs: passed configured PORT/public host, passenger/dashboard routes, production assets, state, WebSocket, passenger request, origin checks and passwordless controls.

## Deployment limitation

The supplied https://hackathon-1-xfrp.onrender.com/dashboard and API inspection returned a Cloudflare JavaScript/cookie challenge. The deployed revision could not be verified from that response. No deployment-specific manual creation defect or local/deployed mismatch is claimed. Render deployment must still be confirmed after main is pushed.
