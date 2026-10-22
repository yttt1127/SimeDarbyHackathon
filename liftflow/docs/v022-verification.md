# ZeroWait V0.2.2 verification — 23 October 2026

Default configuration remains two lifts and ten floors, now with 16 boarding places per lift. Forecast spaces and assignment risk use the hard boarding limit after known exits. ETA, additional-delay scoring, grouping, bypass and committed-stop behavior are unchanged. The legacy comfort field remains accepted and validated for configuration compatibility but is ignored by assignment, forecasts and UI.

Passenger capacity is based on sensor observations before requesting, and on the assigned pickup forecast after requesting. The latter includes known exits and passengers ahead in the pickup queue. UI bands are proportional: below 10/16 Available (blue), below 15/16 Limited (amber), below 1 Nearly full (red), otherwise Full (red). Nonzero sensor uncertainty produces a neutral Uncertain state. These presentation bands never enter assignment scoring; private actual occupancy is not used as a sensor result.

The normal dashboard no longer renders the event log or model settings. Backend events/configuration remain available. Movement, routes, counts, forecasts and all essential controls remain visible. No scheduling-engine rewrite or new model was introduced.

Validation:
- npm test: 38 passing tests across six files, including default capacity, 15+1 boarding, full-load waiting preservation, comfort-independent scores, known exits, uncertainty, grouping, bypass, committed stops and occupancy limits.
- npm run build: TypeScript and production build passed.
- npm run typecheck: passed after browser test additions.
- npm run test:browser: 11 workflows covering desktop/mobile sensor-based color boundaries, uncertainty, automatic assignment, cancellation, reached floors, dashboard cleanup, scenario controls, manual creation, traffic, pause/resume, reset and restart recovery.
- node tests/production-smoke.mjs: passed Render-style host/port, pages, production assets, API, WebSocket and origin checks.
- Reviewed the generated mobile passenger capacity screenshot; existing layout and capacity-colored illustrations are preserved.

Limitations: 16 is a simulated passenger-count default, not a certified physical load rating. The existing backend can intentionally configure another capacity; UI bands scale accordingly. Comfort remains a deprecated compatibility field. Live Render deployment is not verified by the local production-style smoke test.
