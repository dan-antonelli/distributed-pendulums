# Distributed pendulums

Each pendulum runs in its own Node.js server. The servers coordinate over Redis to stop together on a collision and restart together. A React UI shows the pendulums live, starts and stops the simulation, and edits each pendulum.

## Setup

### Quick start

You need Docker.

```sh
docker compose up --build
```

This starts Redis, the gateway, the UI and five pendulum servers. Open http://localhost:5173 and press Start. About a second later two bobs touch, every pendulum freezes, the bobs turn amber, and a striped band counts down 5 seconds. Then every pendulum resets to its starting angle and swings again.

- Another number of pendulums: `docker compose up --build --scale pendulum=7`.
- Other ports: set `UI_PORT` (default 5173) and `GATEWAY_PORT` (default 8080) in the environment or in a `.env` file next to `compose.yaml`.
- Stop everything: `docker compose down`.

### Development without Docker

You need Node 24. Redis still runs in Docker. Run each `dev` command in its own terminal, the pendulum one once per server.

```sh
npm install
npm run dev:redis
npm run dev -w @pendulums/pendulum
npm run dev -w @pendulums/gateway
npm run dev -w @pendulums/ui
```

`npm run bus -w @pendulums/pendulum -- send start` sends a command without the UI (also `pause` and `stop`), and `npm run bus -w @pendulums/pendulum -- watch` prints decoded bus messages. After changing a `.proto` file, run `npm run generate`.

### Running the tests

You need Node 24 and `npm install`. Docker and Redis aren't needed.

```sh
npm test
npm run typecheck
npm run lint -w @pendulums/ui
```

The tests cover the physics, collisions and neighbors, the state machine, a five-server collision cycle on an in-memory bus with fake timers, the gateway API through Connect's in-memory transport, and the UI components in jsdom against a fake `SimulationService`. The five-server test covers a full cycle, two servers reporting the same collision, a lost RESTART, a server that missed the STOP, a server dying mid-cycle, and a user stop during the wait.

## Architecture

![Architecture: the browser calls the gateway over Connect and streams snapshots every 50 ms. The gateway publishes commands and config on pendulums:control and listens to heartbeats and all positions. Each pendulum server publishes its own position 60 times a second, a heartbeat 5 times a second, and STOP, RESTART and READY on pendulums:control, and receives heartbeats, control messages and only its neighbors' positions.](docs/architecture.svg)

Servers never call each other. They only know Redis, and every message on it is binary protobuf from the same `.proto` files as the API. The gateway keeps the latest state of every pendulum in memory. It checks config changes (simulation stopped, values in range, no bob starting on top of another) and refuses Start while two bobs would start overlapping. Pause and Stop are broadcast as they are.

### The collision cycle

Two bobs touch when their centers are closer than their radii added together. Mass only changes bob size: the radius is 0.1 m times the cube root of the mass in kg. `CONTACT_MARGIN_M` in `packages/shared/src/geometry.ts` adds a margin to that distance and is 0 today. Messages from an older cycle are ignored.

![Collision cycle on three servers: server 1 detects a collision and sends STOP with cycle n to all, and all halt. Every server sends RESTART to all. With RESTART from all, each sends READY. With READY from all, each waits 5 seconds, then resets to its starting angle and runs.](docs/collision-cycle.svg)

![Pendulum phases: START moves STOPPED to RUNNING, PAUSE and START move between RUNNING and PAUSED, a collision or a newer cycle moves RUNNING to HALTED, RESTART from all moves HALTED to READY, READY from all moves READY to WAITING, and after 5 seconds WAITING returns to RUNNING. The STOP command returns any phase to STOPPED.](docs/pendulum-states.svg)

### Repo layout

- `proto/`: the protobuf contract for shared types, bus messages and the public API.
- `packages/shared`: generated code, channel names, config validation, bob geometry, the `Bus` interface, the Redis adapter, and an in-memory bus for tests.
- `packages/pendulum`: the pendulum server, with physics, collision checks, the state machine and the collision cycle.
- `packages/gateway`: the Connect API and its view of the system, built from bus traffic.
- `packages/ui`: the React app, which draws the pendulums as SVG in meters.

## Decisions and trade-offs

**Redis pub/sub.** I chose a broker over direct calls or a central coordinator: a server only knows Redis, "tell everyone" is one publish, and adding a server changes nothing else. The cost is one more container that is a single point of failure and doesn't store messages.

**A READY round after RESTART.** Collecting RESTART from everyone only proves that I have them all, and READY proves that everyone else does too, which is what the task asks for. It costs one more message type and phase, and a cycle number makes duplicates, late messages and two servers detecting the same collision harmless.

**Neighbors are the pendulums within reach.** Two bobs can only touch if their anchors are closer than both strings plus both radii, so each server subscribes only to those neighbors' position channels, including a long pendulum that can swing past the one next to it. One shared position channel would have needed about 147,000 deliveries a second at 50 servers (calculated), and the cost of the fix is resubscribing when configs or peers change.

![Five pendulums 1.5 m apart with 1 m strings. Server 3 subscribes only to pendulums:2:position and pendulums:4:position, whose anchors are within its 2.2 m reach. Pendulums 1 and 5 are out of reach.](docs/neighbor-subscriptions.svg)

**Membership frozen at the start of a cycle.** Each server waits for the peers it heard from in the last 5 seconds, except peers that were already stopped, and servers that join later don't count. A participant silent for 5 seconds is dropped, because I chose progress over waiting forever for a server that might be dead.

**Streaming snapshots over Connect.** The browser opens one `WatchPendulums` stream and gets every pendulum's state every 50 ms, independent of the 60 Hz simulation and the number of servers. I chose gRPC over REST for one schema across the bus and the API, generated types on both ends, and streaming without a second technology, at the cost of a codegen step and an API plain curl can't call.

**Fixed-step physics behind a small `Bus` interface.** Physics advances in fixed 1/60 s steps with semi-implicit Euler, which keeps energy steady where plain Euler adds some every step, and a late timer catches up with at most five steps. Server logic talks to the `Bus` interface instead of Redis, so tests run on an in-memory bus with fake timers and a 10-second scenario takes milliseconds.

**Edits count only once applied.** Randomize applies valid random values right away, which makes the collision cycle quick to trigger. A manual edit blocks Start until it is applied or reset, so Start never sends values the user didn't apply, at the cost of one more click.

**No wind.** I left out the wind bonus to spend the time on the distributed logic and the UI.

## Known limitations

- Redis is a single point of failure and pub/sub doesn't store messages. Without Redis, servers keep swinging but can't coordinate.
- While Redis is down, UI commands fail with UNAVAILABLE and positions and heartbeats are dropped. Servers resubscribe on their own when it is back, which I checked on a real Redis.
- Publishing has no deadline. If Redis stalls with the connection still open, commands hang instead of failing with UNAVAILABLE.
- Ids come from a Redis counter that resets when Redis restarts, so a new server can get the id of a live one. Ids are never reused.
- A server stalled for more than 5 seconds is dropped from a cycle, and the others restart without it.
- After a server crashes, its neighbors keep its last position for up to 5 seconds, which can cause a phantom collision.
- The 5-second restart timers start a few milliseconds apart, not at the same instant.
- A server that missed a STOP joins through heartbeats and can restart a few seconds after the others.
- Collisions are checked once per tick, so two fast bobs could pass through each other between ticks. Strings aren't checked.
- Every server hears every heartbeat, so heartbeat traffic grows with the square of N: 1,900 deliveries a second at 20 servers (calculated).
- There is one gateway. If it stops, the UI loses its view, but the simulation keeps running.
- A new server starts stopped and waits for the next Start.
- Containers run TypeScript with tsx, so the images include dev dependencies.
- Containers have no restart policies.
- There is no authentication, and CORS allows any origin by default.
- There is no end-to-end test against real Redis.

## Things I found while building it

- 20 servers in Docker on one Apple Silicon Mac, measured over 10 seconds: 1,378 Redis commands a second against about 1,300 expected (65 per server), Redis at 15.6% CPU, the gateway at 7.6%, and each pendulum server at 4.6% and 140 MiB.
- My first energy test expected almost no drift and failed at about 2.5%. Over 100,000 steps the wobble stayed within each swing, so the test now checks that it is the same after three minutes as at the start.
- The restart timers fire milliseconds apart, so a server that restarted first saw its neighbor still frozen at the collision spot and reported a new collision. Position messages now carry the sender's phase, and only running bobs count.
- An independent review by a different AI model found a stream that leaked one listener per snapshot, a late cycle joiner that could wait forever, and publish failures reported as success. Each fix has a test that fails on the old code.
