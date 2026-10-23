# ZeroWait V0.2.3 verification — 23 October 2026

## Routing investigation

The existing route contract was already correct: / and /passenger open the passenger app; /dashboard explicitly opens the simulator. The Render link previously supplied by the user ended in /dashboard. A read-only public page-reader check returned the passenger app at the root and the old simulator at /dashboard, consistent with the route contract. No service worker, local-storage view preference, or frontend redirect forcing the dashboard was found. A user's personal bookmark/history/cache cannot be inferred from these checks. README now identifies https://hackathon-1-xfrp.onrender.com/ as the public share/QR target. Existing bookmarks or externally generated QR codes targeting /dashboard must be updated by their owners.

## Changes

- One shared Passenger App | Simulator navigation switch, visible at the top of both views including mobile, with active state and 44px touch targets.
- Shared live/session state stays mounted during navigation. History, refresh and direct routes retain their intended destinations and current passenger requests.
- ZeroWait titles and visible branding throughout; internal session storage key, package names and deployment settings remain unchanged.
- Removed decorative sidebar and marketing heading. Simulator has three statistics, compact scheduled-arrival count, concise route empty states and Step inside Advanced.
- Preserved all simulation APIs, scheduling, traffic generation, capacity logic and passenger interactions.
- Fixed an existing 375px overflow: the assigned-journey footer had 24px negative margins while its parent used 18px padding. Margins now match at that breakpoint.

## Validation

- npm test: 38 passing unit/integration tests.
- npm run build: TypeScript and production build passed.
- npm run test:browser: 14 workflows, including navigation/history/refresh, request preservation, cleanup/branding and overflow checks at 375, 390 and 1440px.
- node tests/production-smoke.mjs: production-style routing/assets/API/WebSocket/origin checks passed.
- Fresh passenger and simulator screenshots at all three widths: docs/screenshots/v023-*.png.

The public reader confirmed pre-push routing and older UI content, not an exact deployed commit. The app has no deployed commit identifier. A successful Git push does not itself confirm that Render has finished deploying the new assets.
