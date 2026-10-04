# Flowing Fist — Architecture

This document describes what each part of the codebase does **today**. It is a living document: update the relevant section in the same change that alters a component. For where the project is heading, see [SPEC.md](SPEC.md); for controls and combat rules, see [GAMEPLAY.md](GAMEPLAY.md).

_Last updated: 2026-10-04, after milestone M3 (online duels)._

## The idea in one paragraph

A fight is a deterministic simulation that advances 60 times per second. It is written in plain TypeScript with no rendering or networking code, and lives in a shared package. The browser runs it to play offline and to predict online play; the server runs the same code as the authority. Everything else is either input going into the simulation or a picture of what comes out.

## Component map

```
apps/client      the game in the browser: input, rendering, HUD
apps/server      Colyseus server: one room per fight
packages/sim     the fight simulation
packages/content moves, decks, arenas (data and rules)
packages/netcode server authority and client prediction
packages/protocol network message definitions
tools/assets     asset preparation scripts
```

Dependencies only point downwards in this list:

```
client ──┐                ┌── server
         ├── netcode ─────┤
         │      │         │
         ├── protocol ────┤
         │      │         │
         └──── sim ───────┘
                │
             content
```

`sim`, `content`, `netcode` and `protocol` contain no Babylon.js and no Colyseus code, so they run and are tested in plain Node. Packages export their TypeScript source directly; there is no build step between them. Vite bundles them into the client and the server runs them through `tsx`.

## Running it

| Command | What it does |
|---|---|
| `pnpm run client` | Vite dev server for the game |
| `pnpm run server` | Colyseus server on port 2567, restarts on change |
| `pnpm test` | Unit tests (sim, content, netcode) |
| `pnpm test:e2e` | Browser tests; starts its own client and server |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | Checks and production client build |
| `pnpm assets` | Regenerates animation-only clips from the model files |

Training mode needs only the client. Online duels need both.

---

## packages/content — game data and rules

What can exist in a fight, independent of how it is simulated.

| File | Contents |
|---|---|
| `stances.ts` | The four stances, in a fixed order the simulation indexes into |
| `moves.ts` | `MoveDefinition` and the move list: stances, startup/active/recovery ticks, damage, stamina cost, stun, hitboxes, forward advance |
| `decks.ts` | `CombatDeck` (per stance: a sequence of up to 3 moves and one alternate), `validateDeck`, and the default deck |
| `arenas.ts` | Arena definitions (currently one circular arena) |

Deck rules enforced by `validateDeck`: every move in a sequence must start in the stance the previous one ended in, the first must start in the sequence's own stance, at most 3 per sequence, and no move may appear twice in a deck.

**Current limits:** the 12 moves are placeholders — timings, damage and hitboxes are guesses, sized to the character as drawn (about 2.7 units tall). Move order in the list matters, because the simulation refers to moves by index.

## packages/sim — the fight simulation

Takes a world state and one input per character, and produces the next world state. Nothing else.

| File | Contents |
|---|---|
| `state.ts` | `CharacterState` and `WorldState` (plain numbers and booleans), `createWorld`, `cloneWorld`, `hashWorld`, deck compilation |
| `input.ts` | `InputFrame` (button bitmask, quantised movement axes and camera yaw — all integers), `encodeInput`, `sanitiseInput` |
| `step.ts` | `stepWorld`: one tick of locomotion, dodge, lock-on, guard, attack progression, character separation and arena bounds |
| `combat.ts` | Starting and chaining attacks, hit detection, applying hits, guard and guard break, knockout |
| `math.ts` | Own `sin`, `cos`, `atan2` |
| `tuning.ts` | Speeds, stamina, stun and timing constants |
| `FixedTimestep.ts` | Turns variable frame time into whole ticks, with a leftover fraction for render interpolation |

Rules that keep it deterministic, and must be preserved:

- No `Math.sin`/`cos`/`atan2` — they can differ between JavaScript engines. Use `math.ts`.
- No randomness, no clock, no reads from outside the arguments.
- All state lives in `WorldState`. `hashWorld` covers every `CharacterState` field automatically, so new state must go there to be included in desync checks.

How a tick works: each character first decides what to start (attack, dodge, guard), then plays one tick of whatever it is doing. Afterwards all hits are collected and applied together, so two characters striking on the same tick both get hit.

Conventions: yaw 0 faces +Z and positive turns towards +X; distances are world units; durations are ticks.

**Current limits:** hit detection is on the ground plane only (attack height is recorded but unused); knockout is a training rule (down for 2 seconds, then full health); no feints, manual stance change or defensive styles yet.

## packages/protocol — network messages

The message names and shapes exchanged between client and server, plus the room name, default port and protocol version.

| Message | Direction | Purpose |
|---|---|---|
| `start` | server → client | Fight started or rejoined: your slot, the decks, a full snapshot |
| `tick` | server → client | The inputs the server used for one tick, a hash of the result, and how early this client's input arrived |
| `snapshot` | server → client | Full state, on request |
| `opponent` | server → client | The other player dropped, reconnected or left |
| `input` | client → server | Input frames for one or more ticks |
| `requestSnapshot` | client → server | Local state no longer matches |

Bump `PROTOCOL_VERSION` when a message changes shape; the client refuses to play against a server with a different version.

## packages/netcode — authority and prediction

The networking logic, written against plain objects so it can be tested without sockets.

**`DuelAuthority` (server side).** Owns the real world. Stores incoming input by tick, and on each step picks every player's input, advances the simulation and returns one `tick` message per player. If no input arrived for a tick it repeats the player's last one; input that arrives late is applied on the next tick with its buttons kept, so a quick press is delayed rather than lost. Disconnected players stand still. All input is sanitised.

**`PredictionClient` (client side).** Keeps the last state the server confirmed and the local inputs not yet confirmed. Each frame it rebuilds the present by replaying those inputs on top of the confirmed state, assuming the opponent keeps doing what they were last seen doing. It also:

- adjusts timing from the server's "lead" reports, running slightly fast or slow so inputs arrive just in time;
- detects a mismatch between its hash and the server's, which the caller answers by requesting a snapshot;
- stops predicting after 60 ticks without confirmation, and skips forward after a long pause.

`netcode.test.ts` runs two prediction clients against an authority over simulated links with latency and jitter, and asserts they never desync.

**Current limits:** no input delay; a full replay from the confirmed state every frame (cheap with two characters); inputs are sent as objects, not packed.

## apps/server — Colyseus server

| File | Contents |
|---|---|
| `src/index.ts` | Creates the server with the WebSocket transport and registers the duel room |
| `src/rooms/DuelRoom.ts` | One fight: assigns slots, starts when two players have joined, drives a `DuelAuthority` at 60 Hz, relays its messages, handles drop, reconnect and leave |

The room is deliberately thin: it translates between Colyseus events and `DuelAuthority`. Fight state goes through messages; Colyseus room state is not used.

Lifecycle: the first player waits; when the second joins the room locks and both receive `start`. A dropped player has 20 seconds to reconnect and gets a fresh `start`. If a player leaves for good the room closes.

**Current limits:** no accounts, matchmaking, database or HTTP API; both players get the default deck; one process, no persistence. The room measures elapsed time itself because the value Colyseus passes to the simulation callback is not reliable.

## apps/client — the game in the browser

Babylon.js for rendering, React for the HUD, Vite for bundling.

**Entry and scene**

| File | Contents |
|---|---|
| `src/main.ts` | Creates the engine and scene, mounts the HUD, wires the dev-only inspector (backtick) |
| `src/game/scenes/GameScene.ts` | Environment, the render loop, and the glue: asks the current session for the world, then updates views, camera, overlay and HUD |

**Sessions** — where the world comes from. The scene draws whichever is active without knowing the difference.

| File | Contents |
|---|---|
| `sessions/GameSession.ts` | The interface: update, current and previous world, interpolation fraction, local player, status line |
| `sessions/TrainingSession.ts` | Local simulation against the training dummy, with pause and single-step |
| `sessions/DuelSession.ts` | Connects to the server, feeds a `PredictionClient`, tracks connection phase, optional simulated latency (`?latency=80`) |
| `training/TrainingDummy.ts` | Generates the dummy's input: stand, guard or attack |

**Input, view and camera**

| File | Contents |
|---|---|
| `utils/InputController.ts` | Keyboard and mouse state, sampled once per tick into an `InputFrame`; latches short taps so they are not missed |
| `characters/CharacterView.ts` | Draws one character: loads the model, places it between two ticks, picks the animation. Reads simulation state, never writes it |
| `camera/CameraRig.ts` | Orbit camera driven by the locked pointer; swings behind the player while locked on |
| `debug/CombatDebugOverlay.ts` | Body cylinders and hitbox spheres, coloured by state and attack phase |

**HUD**

| File | Contents |
|---|---|
| `ui/hudStore.ts` | The only link between game and UI: the game publishes plain data, React subscribes; also carries the actions the UI may trigger |
| `ui/Hud.tsx` | Health and stamina bars, stance indicator, status line, controls help, session switch |

UI code is kept Preact-compatible: function components and hooks only.

**Controls:** listed in [GAMEPLAY.md](GAMEPLAY.md). Key bindings live in `InputController.sampleInputFrame`; session and debug keys in `GameScene` and `TrainingSession`.

**Tests:** `e2e/` holds Playwright tests that run the real game in headless Chromium. In dev builds the scene is exposed as `window.flowingFist` so tests can read the simulation state.

**Current limits:** there are no attack animations, so an attack shows only as the character sliding forward plus the hitbox overlay. Only idle, run and strafe clips exist. The model is drawn mirrored, which is why the strafe clips are swapped in `CharacterView`. No menus, deck editor, sound or effects.

## tools/assets — asset preparation

`strip-animation-meshes.mjs` reads each Mixamo animation file, removes the embedded mesh, and writes an animation-only clip (about 80 KB instead of 2.2 MB) to `public/models/<character>/clips/`. The client does not load these yet; it still uses the combined model file. Model files are not tracked in git.

## Cross-cutting

- **Tooling:** pnpm workspaces, TypeScript, ESLint (4-space indent, single quotes), Vitest, Playwright.
- **CI:** `.github/workflows/ci.yml` runs lint, typecheck, unit tests, build and browser tests.
- **Adding state to a character:** add the field in `createCharacter`; cloning, hashing and snapshots pick it up.
- **Adding a move:** add it to `moves.ts`; put it in a deck; `validateDeck` will tell you if the stances do not chain.
- **Adding a message:** define it in `protocol`, handle it in `DuelRoom` and `DuelSession`, bump `PROTOCOL_VERSION`.

## How to keep this document current

When a change adds, removes or re-purposes a file listed here, or lifts one of the "current limits", edit that section and the "last updated" line in the same commit.
