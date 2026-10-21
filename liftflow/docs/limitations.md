# V0.1 limitations and deferred work

- This is a functional local simulation, not a real elevator controller or certified safety model.
- There is no camera integration, object detection, weight measurement, physical hardware API, authentication, push service, database or cloud deployment.
- Headcount comfort thresholds and the separate simulated boarding limit are illustrative. No headcount implies certified capacity or guaranteed boarding.
- Passenger UP/DOWN requests generate a seeded synthetic private destination in that direction. Manual operator-created passengers can have an explicit destination. Neither origin is inferred from network information.
- Forecasts conservatively retain waiting passengers through later stops because their destinations are unknown. The uncertainty model only represents mock count error; it is not a statistical confidence interval for future traffic.
- A committed travel target is not interrupted for newly arriving calls at intermediate floors. Real elevator commitment rules and APIs vary by manufacturer.
- Simultaneous physical events are processed deterministically in elevator order. The model omits acceleration, accessibility boarding times, door obstructions, priority service and equipment failures.
- Synthetic traffic is generated in user-triggered batches. There is no continuous arrival-rate model in this version.
- The browser session token is held in session storage and survives same-tab reloads while the server is alive. It is not an account, and requests cannot be recovered after ending that session. Operator controls are shared and unrestricted on the loopback demo.
- All simulation history is in memory; it is not an unlimited-duration monitoring service. Restart/reset clears it. Export events before resetting if they are needed.
- Dashboard snapshots contain full simulation requests and current passenger status for transparency. The UI is not a production privacy boundary.
- Event-loop wall-clock catch-up is capped at one second per server tick after suspension. Simulated time remains internally consistent but does not catch up for time the computer was asleep.
- Browser checks cover Edge desktop and narrow mobile viewports, not physical mobile devices or every browser. The server is intentionally not LAN-accessible.
- No comparative performance benchmarks, trained models, algorithm tuning experiments or claims of improved real-world waiting time have been implemented.

M1–M5 prototype functionality is implemented. Production persistence, real camera/elevator adapters and performance evaluation remain future phases; none are represented as completed work.
