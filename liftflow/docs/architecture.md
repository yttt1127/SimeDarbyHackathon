# Liftflow V0.1 architecture

The Node process owns one in-memory simulation. React dashboard and passenger views subscribe to identical versioned snapshots over WebSocket. Commands use validated HTTP JSON; a server-issued per-browser session token scopes passenger commands. Public operator sessions additionally require an environment-configured password. This is prototype access control, not a full account system.

## Boundaries and models

- **Simulation:** authoritative clock, passengers (private destinations), requests, cars, motion and door events. Passengers move through waiting → boarding → riding → exiting → completed, or cancelled. The event queue advances directly to physical phase boundaries.
- **Scheduling:** consumes current car position, direction, committed stop, registered car calls and active hall calls. Directional collective service preserves a committed stop, services compatible calls along a sweep, then reverses. Opposite-direction calls can require a second visit to a floor.
- **Sensors:** replaceable `OccupancySensor`; the mock reads only current headcounts. Observation timestamps, uncertainty and optional deterministic count errors accompany measurements. Future object-presence/space observations are reserved fields.
- **Prediction:** receives a deliberately restricted `Knowledge` DTO, never simulation passengers or future events. It forecasts every stop from observed occupancy, registered car destination counts and known hall requests. Destinations of waiting passengers are unknown; it conservatively carries predicted boarders through the remaining route. Actual car calls appear only after boarding.
- **Assignment:** evaluates a hypothetical insertion on each car. Score is pickup ETA + 30 seconds × failed boarding risk + 0.25 × additional passenger-delay seconds. Both coefficients are configurable. Delays sum changes for existing pickup and onboard destination service; no future traffic is considered. This is an explainable heuristic, not an optimal policy.
- **API:** coordinates commands, session ownership, snapshots and broadcasts. Storage is memory-only; policy and sensor interfaces are injectable.

## Physical and scheduling assumptions

Floors are 1–10 by default. Travel takes 4 simulated seconds per floor and a stop takes 8 seconds (2 opening, 4 boarding, 2 closing). Movement is continuous between discrete events. Once travel to a stop starts, that stop is physically committed: cancellation/reassignment of its pickups is rejected until service completes. Idle cars dispatch at the next simulation advance, permitting pending calls to be cancelled while paused.

The configurable comfort threshold drives forecasts; a separate simulated boarding limit is the hard headcount bound. Neither is a weight measurement or certified capacity. Default values are both 10. At a stop, exiting precedes boarding. Requests which cannot board remain waiting and are rescheduled after departure. Only passengers assigned to this car and travelling in the stop's service direction board.

Every schedule entry carries pickup IDs and registered destination IDs. A shared floor remains scheduled while any valid request or car call requires it. A committed stop remains even if no other service is needed. Route planning uses registered destinations, not private destinations of waiting passengers. No random future arrivals are preloaded into forecasts.

Arrival ETA means doors begin opening. A currently serviced stop is displayed with ETA zero until it closes; its forecast indicates that service is underway. Remaining phase time is included in later ETAs. All values use the same simulation clock, independent of wall-clock speed.

## Delivery milestones

M1: simulator, scheduler, lifecycle, full route and ETA tests before UI.
M2: live API, shared dashboard/passenger state and controls.
M3: sensor observations and independent capacity forecasts.
M4: candidate scoring, stable assignments and explicit alternative acceptance.
M5: integration, browser verification, scenarios and operator documentation.

No real camera, elevator hardware, cloud service, machine learning or performance benchmark is included.
