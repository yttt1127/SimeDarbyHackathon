# Algorithms and information boundaries

## Directional collective route

The scheduler sees the current car position/direction, current committed stop, active assigned hall requests and registered onboard calls. It serves compatible calls in the current direction before reversing. When only opposite-direction halls remain ahead, it travels to the farthest one to begin the return sweep. Floor visits are directional entries, so an UP pickup and a later DOWN pickup at one floor are separate stops.

A travel target becomes committed when simulation time advances and dispatch begins. It cannot be interrupted by cancellation or reassignment. Waiting requests may still be added to compatible service; a request arriving after boarding begins requires a subsequent visit. Onboard destination calls always remain in the schedule. Passengers who fail to board are deferred behind existing service to prevent an infinite reopen loop at the same full car.

The physical event engine has IDLE, MOVING, OPENING, BOARDING and CLOSING phases. At default timing, opening is 2 seconds, boarding/exiting 4 seconds and closing 2 seconds. Ground-truth headcounts update at the beginning of boarding; lifecycle labels remain boarding/exiting until that phase ends.

## ETA

For an idle car, a first stop's ETA is distance × seconds per floor. Later ETAs add the previous stop's dwell and travel distance. For committed movement, the engine's remaining travel time is authoritative. For an active door phase, the current stop's ETA is zero and the remaining phase plus later door phases determine departure time.

ETAs cover the **currently known** route. Future arrivals and unregistered destinations can change it. Wall-clock speed only changes the rate of simulated time; it does not change these calculations.

## Occupancy

`Knowledge` is the prediction/assignment boundary. It contains no passenger records, waiting destinations, random-number state or future event queue. The mock sensor only receives current counts. Hidden destinations of waiting passengers cannot affect scheduling or forecasts; tests compare identical observations with different private destinations.

At each stop:

```text
predicted exits = min(predicted arriving occupancy, known destination count)
before boarding = max(0, arriving occupancy - predicted exits)
estimated spaces = max(0, comfort threshold - before boarding)
hard boarding spaces = max(0, boarding limit - before boarding)
predicted boarding = min(assigned waiting count, hard boarding spaces)
after stop = before boarding + predicted boarding
```

Unregistered destinations of predicted boarders are conservatively carried through subsequent planned stops. This can overestimate later occupancy and influence assignment; the limitation is visible in the UI. A newly boarded passenger's actual destination becomes a public car call, allowing the next forecast to include that exit.

“Likely full” means hard boarding spaces plus sensor uncertainty is below waiting demand (at least one prospective passenger). “Likely space available” means spaces minus uncertainty meets that demand. Otherwise the classification is “Uncertain”. These are heuristic classifications, not calibrated probabilities or guarantees.

The mock camera's optional error is a deterministic, bounded function of time, seed and sensor ID. It does not simulate vision inference. The interface reserves optional object-presence and occupied-space fields for later adapters.

## Capacity-aware assignment

Insert each new hall request into each car's current route. The candidate's pickup position determines its ETA and estimated spaces. Comfort-space shortfall risk is a bounded heuristic (the physical boarding limit is checked separately):

```text
rank = position in the stop's assigned boarding queue, starting at 1
risk = clamp((rank - estimated spaces + observation uncertainty) / rank, 0, 1)
score = pickup ETA + riskWeight × risk + delayWeight × additional passenger delay
```

Additional delay sums positive ETA changes for existing hall requests and onboard destination calls on the candidate car. Defaults: `riskWeight = 30` seconds and `delayWeight = 0.25`. Ties use elevator ID for determinism. Weights are configurable and have not been optimized or benchmarked.

The legacy explicit alternative API remains available only if the existing request is waiting and uncommitted, assigned risk is at least 0.5, alternative risk is lower, and alternative score improves by more than 3 seconds. Acceptance revalidates the current state. The passenger UI does not expose explicit alternative acceptance. V0.2 automatically coordinates hall groups and bypass service as described below.

## Cancel/reassign

The API authenticates a local session token to a separate public session ID; tokens are not published in snapshots. Pending requests must belong to that session. Committed pickups and onboard requests cannot be changed. Removing a request recomputes the schedule from remaining hall and car calls. Stops with other valid service remain; eligible removals are logged.

## V0.2 hall coordination and bypass

New requests prefer an existing floor/direction hall visit when conservative predicted hard boarding slots accommodate their queue rank. Otherwise normal ETA/comfort scoring chooses a car. Before dispatch, split groups are consolidated onto the earliest feasible single car only when the entire group fits and no car is already physically committed to that hall stop. Overflow groups remain split. At boarding, compatible waiting requests can also be collected from other assignments when their original car is not committed to their pickup. Transfers update each authoritative request, log a reassignment and preserve its session ownership. Physical boarding still checks the actual hard limit, exits first, and each passenger’s waiting state.

Before dispatch, a car with zero observation uncertainty and enough currently observed riders to fill its hard boarding limit can bypass uncommitted pickup-only stops. Known exits reduce this conservative lower bound; hypothetical future boarders never justify bypass. Requests are deferred behind existing car calls, not deleted. A zero-risk alternative may receive the request automatically; otherwise the original car returns after its registered destinations. Drop-offs and committed stops are never removed. Sensor uncertainty disables this preemptive bypass; physical failed boarding remains deferred to prevent immediate reopen loops.

Deferred hall requests remain part of the finite collective route. Once ordinary calls are consumed, the scheduler returns to the deferred queue. New passengers’ hidden destinations are never used by this coordination, bypass or prediction logic.

## Timed residential arrivals

A private seeded arrival queue advances alongside physical phase events. Morning and evening select their configured down/up lobby share; remaining trips use the opposite lobby flow. Off-peak and heavy choose the configured lobby share, then use distinct residential floors for the remainder. Heavy changes count and gaps, not the residential trip mix. The queue is absent from public snapshots and prediction knowledge. Each arrival becomes an ordinary request only at its scheduled time.
