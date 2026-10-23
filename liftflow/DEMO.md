# ZeroWait — Simulator Demo

ZeroWait demonstrates how two lifts serve a 10-floor residential building. Each lift has a default simulated capacity of 16 passengers.

## Open the demo

- [Passenger App](https://hackathon-1-xfrp.onrender.com/) — call a lift and see your assignment.
- [Simulator](https://hackathon-1-xfrp.onrender.com/dashboard) — create passengers and watch the lifts move.

Use **Passenger App | Simulator** at the top to switch views. Wait for **Live connection** before starting. Use the Passenger App link for sharing or QR codes.

## Quick walkthrough

1. Open **Simulator** and press **Reset** for a clean start.
2. Choose **Add passengers**. Enter origin **3**, destination **8**, and **2** passengers, then submit. Two passengers appear immediately, even while paused.
3. Press **Start / resume**. Watch the lift move, pick up passengers and take them to their destination. Upcoming stops show ETAs and capacity forecasts.
4. Press **Generate traffic** to schedule more residential journeys. It automatically starts or resumes the simulator. **Scheduled arrivals** shows how many passengers have yet to appear.
5. Press **Pause** to freeze simulation time. Press **Start / resume** to continue.
6. Switch to **Passenger App**, choose a demo floor, then select **Call a lift → Going Up / Going Down**. ZeroWait assigns a lift automatically and displays its ETA. You can cancel before the pickup is committed.

## Controls

| Control | What it does |
| --- | --- |
| Start / resume · Pause | Run or pause the simulation. |
| Reset | Clear passengers and scheduled arrivals; return to a paused start. |
| Playback speed | Change how quickly simulated time passes. |
| Add passengers | Immediately create journeys between two different floors. |
| Generate traffic | Schedule residential arrivals and start the simulation. |
| Load scenario | Load a demonstration such as Morning, Evening, Off-peak or Heavy; press Start to run it. |
| Advanced → +1s Step | Advance one simulated second while paused. |

## Optional: demonstrate a full lift

1. In Simulator, select **Capacity switch** and click **Load**. Keep it paused.
2. Switch to Passenger App and call **Going Up** from **Demo Floor 04**.
3. Return to Simulator, expand **Run the capacity demonstration**, then click **Add lobby surge & advance 2s**.
4. Return to Passenger App to see the updated assignment, then resume the simulator to complete the journey.

## Capacity colors

| Color | Status at the default capacity |
| --- | --- |
| Blue | Available: 0–9 passengers |
| Amber | Limited: 10–14 passengers |
| Red | Nearly full: 15; Full: 16 |
| Gray | Uncertain observation or prediction |

Before calling, capacity reflects sensor observations. After calling, the assigned lift shows predicted availability at your pickup. These are estimates, not boarding guarantees or certified physical load ratings.

## Run locally

From the `liftflow` folder, with Node.js 22 or newer installed:

```powershell
npm ci
npm run build
npm start
```

Open http://127.0.0.1:3001/ and use the navigation switch to reach Simulator.

The public demo shares one simulation across visitors. Reset affects everyone, and server restarts clear the simulation. This prototype does not control real lifts.
