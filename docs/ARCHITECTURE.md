# Flowing Fist — Architecture

This document describes what each part of the codebase does **today**. It is a living document: update the relevant section in the same change that alters a component. For where the project is heading, see [SPEC.md](SPEC.md); for controls and combat rules, see [GAMEPLAY.md](GAMEPLAY.md).

_Last updated: 2026-10-06, after milestone M5 (match flow) and the tiled arena floor._

## The idea in one paragraph

A fight is a deterministic simulation that advances 60 times per second. It is written in plain TypeScript with no rendering or networking code, and lives in a shared package. The browser runs it to play offline and to predict online play; the server runs the same code as the authority. Everything else is either input going into the simulation or a picture of what comes out.

## Component map

```
apps/client      the game in the browser: input, rendering, HUD
apps/server      Colyseus server: the matchmaking queue, one room per match, plus the HTTP API for accounts, decks and match history
packages/sim     the fight simulation
packages/content moves, decks, arenas (data and rules)
packages/netcode server authority and client prediction
packages/protocol network message definitions
tools/assets     builds the character model from Mixamo downloads
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
| `docker compose up -d` | The MariaDB database the server needs, on port 3307 |
| `pnpm run server` | Colyseus server and HTTP API on port 2567, restarts on change |
| `pnpm test` | Unit tests (sim, content, netcode) and server tests; the server tests need the database |
| `pnpm test:e2e` | Browser tests; starts its own client and server |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | Checks and production client build |
| `pnpm assets` | Builds the character model from the Mixamo downloads in `assets-src/`; needs Blender |
| `pnpm --filter @flowing-fist/server db:generate` | Writes a migration for changes made to `db/schema.ts` |

Training mode needs only the client. Online duels, accounts and the deck editor need the server, and the server needs the database.

---

## packages/content — game data and rules

What can exist in a fight, independent of how it is simulated.

| File | Contents |
|---|---|
| `stances.ts` | The four stances, in a fixed order the simulation indexes into |
| `moves.ts` | `MoveDefinition` and the move list: stances, startup/active/recovery ticks, damage, stamina cost, stun, hitboxes, forward advance |
| `decks.ts` | `CombatDeck` (per stance: a sequence of up to 3 moves and one alternate), `parseDeck`, `validateDeck`, and the default deck |
| `arenas.ts` | Arena definitions (currently one circular arena) |

Deck rules enforced by `validateDeck`: every move in a sequence must start in the stance the previous one ended in, the first must start in the sequence's own stance, at most 3 per sequence, and no move may appear twice in a deck.

A deck from outside (a request body, a database row, browser storage) goes through `parseDeck` first, which checks only its shape and returns a clean copy, and then through `validateDeck`. The deck editor, the HTTP API and the duel room all use these two functions, so the rules exist once.

**Current limits:** the 12 moves are placeholders — timings, damage and hitboxes are guesses, sized to the character as drawn (about 2.7 units tall). Move order in the list matters, because the simulation refers to moves by index.

## packages/sim — the fight simulation

Takes a world state and one input per character, and produces the next world state. Nothing else.

| File | Contents |
|---|---|
| `state.ts` | `CharacterState`, `MatchState` and `WorldState` (plain numbers and booleans), `createWorld`, `cloneWorld`, `hashWorld`, deck compilation |
| `input.ts` | `InputFrame` (button bitmask, quantised movement axes and camera yaw — all integers), `encodeInput`, `sanitiseInput` |
| `step.ts` | `stepWorld`: one tick of locomotion, dodge, lock-on, guard, parry, feint, attack progression, character separation and arena bounds |
| `combat.ts` | Starting and chaining attacks, hit detection, applying hits, guard and guard break, parried attacks, knockout |
| `match.ts` | Rounds: `createMatchWorld`, the countdown, the round clock, deciding a round and the match, resetting the fighters between rounds |
| `math.ts` | Own `sin`, `cos`, `atan2` |
| `tuning.ts` | Speeds, stamina, stun and timing constants |
| `FixedTimestep.ts` | Turns variable frame time into whole ticks, with a leftover fraction for render interpolation |

Rules that keep it deterministic, and must be preserved:

- No `Math.sin`/`cos`/`atan2` — they can differ between JavaScript engines. Use `math.ts`.
- No randomness, no clock, no reads from outside the arguments.
- All state lives in `WorldState`. `hashWorld` covers every `CharacterState` field automatically, so new state must go there to be included in desync checks. `MatchState` fields are listed by hand in `hashWorld`; a new one must be added there.

How a tick works: each character first decides what to start (attack, parry, dodge, guard), then plays one tick of whatever it is doing. Afterwards all hits are collected and applied together, so two characters striking on the same tick both get hit. Last, the match advances.

**Matches.** A world may carry a `MatchState` (`world.match`); training has none. It holds the phase (countdown, fighting, round over, match over), the ticks left in it, the round number and each character's rounds won. Because it is part of the world, it is predicted, hashed, snapshotted and corrected exactly like the fight, and the server and both clients cannot disagree about the score or the clock. Outside the fighting phase characters ignore everything but the lock-on toggle and no hits are resolved. In a match a knocked-out character stays down until the next round; without one it gets up after 2 seconds (the training rule). The spec proposed Colyseus Schema state for round score and timer; keeping them in the simulation replaced that.

Conventions: yaw 0 faces +Z and positive turns towards +X; distances are world units; durations are ticks.

**Current limits:** hit detection is on the ground plane only (attack height is recorded but unused); the parry is the only defensive style and everyone has it; no manual stance change; no ring-out.

## packages/protocol — network messages

The message names and shapes exchanged between client and server, plus the room name, default port and protocol version. It also holds the request and response types of the HTTP API (`AccountInfo`, `AuthResponse`, `SavedDeck`, ...) and its limits (deck count, name and password lengths), so client and server cannot disagree about them.

| Message | Direction | Purpose |
|---|---|---|
| `start` | server → client | Match started or rejoined: your slot, both decks, display names and ratings, whether it is ranked or private, a full snapshot (which includes the rounds and score) |
| `tick` | server → client | The inputs the server used for one tick, a hash of the result, and how early this client's input arrived |
| `snapshot` | server → client | Full state, on request |
| `opponent` | server → client | The other player dropped or reconnected |
| `result` | server → client | The match is over: winner, rounds won, whether it was played out or forfeited, and each player's rating before and after (ranked only) |
| `matchFound` | server → client, in the matchmaking room | An opponent was found; carries the seat reservation for the duel room |
| `input` | client → server | Input frames for one or more ticks |
| `requestSnapshot` | client → server | Local state no longer matches |

Bump `PROTOCOL_VERSION` when a message changes shape; the client refuses to play against a server with a different version.

## packages/netcode — authority and prediction

The networking logic, written against plain objects so it can be tested without sockets.

**`DuelAuthority` (server side).** Owns the real world, created by `createMatchWorld`, so it plays a whole match; `isMatchOver` and `getMatch` tell the room when and how it ended. Stores incoming input by tick, and on each step picks every player's input, advances the simulation and returns one `tick` message per player. If no input arrived for a tick it repeats the player's last one; input that arrives late is applied on the next tick with its buttons kept, so a quick press is delayed rather than lost. Disconnected players stand still. All input is sanitised.

**`PredictionClient` (client side).** Keeps the last state the server confirmed and the local inputs not yet confirmed. Each frame it rebuilds the present by replaying those inputs on top of the confirmed state, assuming the opponent keeps doing what they were last seen doing. It also:

- adjusts timing from the server's "lead" reports, running slightly fast or slow so inputs arrive just in time;
- detects a mismatch between its hash and the server's, which the caller answers by requesting a snapshot;
- stops predicting after 60 ticks without confirmation, and skips forward after a long pause.

`netcode.test.ts` runs two prediction clients against an authority over simulated links with latency and jitter, and asserts they never desync.

**Current limits:** no input delay; a full replay from the confirmed state every frame (cheap with two characters); inputs are sent as objects, not packed.

## apps/server — Colyseus server and HTTP API

One Node process serves both the matches (WebSocket) and the accounts, decks and match history (HTTP, under `/api`).

| File | Contents |
|---|---|
| `src/index.ts` | Opens the database, creates the server, mounts the API and registers the duel and matchmaking rooms |
| `src/config.ts` | Port, database URL, token secret and sign-in rate limit, read from the environment. Development defaults match `docker-compose.yml`; in production the database URL and secret must be set |
| `src/db/schema.ts` | The tables, as Drizzle definitions |
| `src/db/database.ts` | Connects, creates the database if it is missing, and applies pending migrations on start-up |
| `drizzle/` | Generated SQL migrations. Never edit one that has been applied; change `schema.ts` and generate a new one |
| `src/auth/tokens.ts` | Signs and verifies the JWT that identifies a player (30 days) |
| `src/auth/passwords.ts` | Password hashing with scrypt |
| `src/accounts/accounts.ts` | Guest creation, registration (which upgrades a guest in place), login |
| `src/decks/decks.ts` | Deck list, create, change, delete, activate; `getFightingDeck` for the duel room |
| `src/http/api.ts` | The routes: reads the token, calls the functions above, turns errors into JSON answers |
| `src/http/rateLimit.ts` | Per-address request limit on the sign-in routes |
| `src/matches/matches.ts` | `recordMatch` (stores a finished match and moves ratings, in one transaction), `getRating`, `getProfile`, `listMatches` |
| `src/ratings/elo.ts` | The Elo formula (K = 32) |
| `src/rooms/players.ts` | `authenticatePlayer`: token → account, fighting deck and rating; used by both rooms |
| `src/rooms/matchmaking.ts` | `pairWaitingPlayers` (who fights whom, a pure function) and the match tickets |
| `src/rooms/MatchmakingRoom.ts` | The ranked queue: holds waiting clients, pairs them once a second, creates a duel room per pair and sends each player a seat in it |
| `src/rooms/DuelRoom.ts` | One match, ranked or private: assigns slots, starts when two players have joined, drives a `DuelAuthority` at 60 Hz, relays its messages, handles drop, reconnect and leave, and records the result |

**Tables**

| Table | Contents |
|---|---|
| `users` | Id (UUID), display name, email and password hash (both empty for a guest) |
| `decks` | Id (UUID), owner, name, the deck as JSON, and whether it is the owner's active deck |
| `ratings` | Per account: rating and ranked games, wins, losses, draws. A row appears with the first ranked match; without one the rating is 1000 |
| `matches` | One finished match: ranked or private, played out or forfeited, rounds, length in ticks, when it ended |
| `match_players` | Per match and slot: the account, the name it fought under, rounds won, outcome, rating before and after (empty for private) |

**HTTP API** — JSON in and out; everything except the three `auth` routes needs `Authorization: Bearer <token>`.

| Route | Purpose |
|---|---|
| `POST /api/auth/guest` | New guest account and its token |
| `POST /api/auth/register` | Email, password, display name. With a guest's token, that guest becomes the registered account and keeps its decks |
| `POST /api/auth/login` | Token for a registered account |
| `GET /api/me` | The account behind the token |
| `GET /api/profile` | Rating and ranked record |
| `GET /api/matches` | The account's latest 20 matches, newest first, each from its own point of view |
| `GET /api/decks` | The account's decks |
| `POST /api/decks` | Save a new deck; an account's first deck becomes its active one |
| `PUT /api/decks/:id` | Change a deck's name and content |
| `DELETE /api/decks/:id` | Delete a deck |
| `POST /api/decks/:id/activate` | Make it the deck the account fights with |

Errors are `{ error, details? }` with a fitting status: 401 without a usable token, 404 for a deck that is missing or someone else's, 409 for a taken email or a full deck list, 422 for invalid input (for a deck, `details` lists each broken rule), 429 when rate-limited.

**Accounts.** Everyone is an account from the first visit: the client asks for a guest, which is a normal `users` row without an email, known only by the token in that browser. Registering fills in the email and password on the same row.

**Decks in a fight.** A client never sends its deck to a room. It joins with its token; `authenticatePlayer` (the `onAuth` of both rooms) looks up the account, loads its active deck (the default deck if it has none) and runs it through `parseDeck` and `validateDeck` again, because the move list may have changed since the deck was saved. A deck that fails is refused with the reason, and the player is not let in.

**Ranked matches.** A client joins the matchmaking room and waits. Once a second `pairWaitingPlayers` pairs the queue: the longest-waiting player is served first and gets the closest-rated opponent within a rating difference that starts at 100 and widens by 50 for every second they have waited. For each pair the room creates a duel room and reserves a seat in it for both players, passing along the player it already authenticated, and sends each a `matchFound`. An account can be in the queue only once.

A ranked duel room must not be creatable by a client, yet Colyseus creates rooms from options a client could also send. So the matchmaker passes a one-use **ticket** that only this process knows (`issueMatchTicket` / `redeemMatchTicket`); a duel room created without a valid ticket is a private one. A ranked room lets in only the two accounts its ticket names, and closes if they have not both arrived within 15 seconds.

**Private matches.** A client creates a duel room directly; the room gives itself a five-character id, which is the code the other player joins with (`joinById`). All duel rooms are hidden from Colyseus' own room search.

**The duel room** stays thin: it translates between Colyseus events and `DuelAuthority`. Match state goes through messages; Colyseus room state is not used.

Lifecycle: when the second player joins, the room locks and both receive `start`. A dropped player has 20 seconds to reconnect and gets a fresh `start`. The match ends when the simulation reaches "match over" or when a player leaves for good, which forfeits it to the other. Either way the room stores the match with `recordMatch`, sends both players `result` and closes. For a ranked match `recordMatch` also applies Elo to both ratings; a private match is stored without touching them.

**Tests:** `src/http/api.test.ts`, `src/matches/matches.test.ts` and `src/rooms/DuelRoom.test.ts` run the real API, match recording and the rooms' token check against a separate `flowing_fist_test` database, which they create and empty themselves. `rooms/matchmaking.test.ts` and `ratings/elo.test.ts` need no database. The rooms themselves (queue, seat hand-over, forfeit, result) have no automated test; they were checked once with a scripted pair of clients.

**Current limits:** one queue for everyone (no regions); guests are rated and matched like registered accounts; no rematch; a forfeit counts as a full loss however early it happens; no OAuth, password reset or email verification; guests are never cleaned up; the same account can sit on both sides of a private duel (two tabs of one browser share an account), but not of a ranked one. The queue and the tickets live in memory. Migrations only go forwards (Drizzle generates no "down" step). The rate limit and the fights live in memory, so there is one process. Cross-origin headers come from Colyseus, which allows any origin. The room measures elapsed time itself because the value Colyseus passes to the simulation callback is not reliable.

## apps/client — the game in the browser

Babylon.js for rendering, React for the HUD, Vite for bundling.

**Entry and scene**

| File | Contents |
|---|---|
| `src/main.ts` | Creates the engine and scene, mounts the HUD, wires the dev-only inspector (backtick) |
| `src/game/scenes/GameScene.ts` | Environment (sky, lights, and the floor: stone tiles drawn in code onto a repeating texture, with size and colours as constants at the top of the file), the render loop, and the glue: asks the current session for the world, then updates views, camera, overlay and HUD |

**Sessions** — where the world comes from. The scene draws whichever is active without knowing the difference.

| File | Contents |
|---|---|
| `sessions/GameSession.ts` | The interface: update, current and previous world, interpolation fraction, local player, status line, and what to show before a fight (lobby) and after it (result) |
| `sessions/TrainingSession.ts` | Local simulation against the training dummy, with pause and single-step. The player uses their active deck, the dummy the default one |
| `sessions/DuelSession.ts` | Gets into a duel room as asked — through the matchmaking queue, by creating a private room, or by joining one by code — then feeds a `PredictionClient`, tracks the phase (connecting, searching, waiting, fighting, reconnecting, finished, ended), keeps the result, optional simulated latency (`?latency=80`) |
| `training/TrainingDummy.ts` | Generates the dummy's input: stand, guard or attack |

**Input, view and camera**

| File | Contents |
|---|---|
| `utils/InputController.ts` | Keyboard and mouse state, sampled once per tick into an `InputFrame`; latches short taps so they are not missed |
| `characters/CharacterView.ts` | Draws one character: loads the model, places it between two ticks, picks the animation. Reads simulation state, never writes it |
| `camera/CameraRig.ts` | Orbit camera driven by the locked pointer; swings behind the player while locked on |
| `debug/CombatDebugOverlay.ts` | Body cylinders and hitbox spheres, coloured by state and attack phase |

**Account and decks**

| File | Contents |
|---|---|
| `api/apiClient.ts` | The server address and one typed function per API route |
| `account/accountStore.ts` | Who the player is, which decks they own, their rating and latest matches (refreshed after signing in and after every match). Signs in with the remembered token or as a new guest, and is the only caller of the API. Publishes the active deck, which it also remembers in browser storage so training has it before the server answers, or when it cannot be reached |

**HUD and menu**

| File | Contents |
|---|---|
| `ui/hudStore.ts` | The only link from the fight to the UI: the game publishes plain data, React subscribes; also carries the actions the UI may trigger |
| `ui/Hud.tsx` | Health and stamina bars, rounds won, round clock, announcements ("Round 2 · 3", "Fight!", "KO"), the lobby and result dialogs, stance indicator, status line, controls help, session switch, menu button |
| `ui/menuStore.ts` | Whether the menu is open. While it is, `InputController`, `GameScene` and `TrainingSession` ignore the keyboard, so typing does not move the character |
| `ui/Menu.tsx` | The overlay holding the account panel, the play panel and the deck editor, or a notice when the server is unreachable |
| `ui/PlayPanel.tsx` | Find a ranked match, create a private duel or join one by code; rating and match history |
| `ui/AccountPanel.tsx` | Who you are playing as; create account, log in, log out |
| `ui/DeckEditor.tsx` | Deck list and the slot grid; save, activate, delete |
| `ui/deckEditing.ts` | The editor's logic without React: which moves a slot may hold, and what changing a slot does to the rest of its sequence |

When the active deck changes, `GameScene` restarts training with it. A duel keeps the decks it started with.

`GameScene` builds the round display from `world.match` each frame, so it follows prediction and corrections like everything else drawn. The result dialog, by contrast, appears only on the server's `result` message, never on a predicted end of match.

UI code is kept Preact-compatible: function components and hooks only.

**Controls:** listed in [GAMEPLAY.md](GAMEPLAY.md). Key bindings live in `InputController.sampleInputFrame`; session and debug keys in `GameScene` and `TrainingSession`.

**Tests:** `e2e/` holds Playwright tests that run the real game in headless Chromium. In dev builds the scene is exposed as `window.flowingFist` so tests can read the simulation state.

**Current limits:** there are no attack animations, so an attack shows only as the character sliding forward plus the hitbox overlay. Only idle, run and strafe clips exist. The model is drawn mirrored, which is why the strafe clips are swapped in `CharacterView`. A parry is likewise visible only in the overlay and the status text. A dodge reuses the run and strafe clips slowed down, holding the one it started with for its whole length. No sound or effects. The deck editor shows move names and end stances but no timings. The floor covers the arena as a square and nothing marks the arena's circular edge.

## tools/assets — asset preparation

Builds the model the game loads from the Mixamo FBX files in `assets-src/`. The workflow, including what to download and how, is in [ASSETS.md](ASSETS.md).

| File | Contents |
|---|---|
| `build-characters.mjs` | `pnpm assets`: finds Blender, runs the script below for each character folder, then lists the clips in the result |
| `build-character.py` | Runs inside Blender, in the background: imports the character and each animation file, names each clip after its file, exports one GLB |

Neither `assets-src/` nor the built model files are tracked in git.

**Current limits:** all clips live in one file with the mesh, so every clip is downloaded up front. Root motion is not baked into move data, because no attack clips exist yet.

## Cross-cutting

- **Tooling:** pnpm workspaces, TypeScript, ESLint (4-space indent, single quotes), Vitest, Playwright.
- **No CI.** Checks are run by hand: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Playing the game through in the browser is done by the developer; `pnpm test:e2e` exists but is not part of the routine.
- **Changing a table:** edit `apps/server/src/db/schema.ts`, run `db:generate`, commit the new file in `drizzle/`. It is applied the next time the server starts.
- **Adding an API route:** types in `protocol`, the operation in `accounts/`, `decks/` or `matches/`, the route in `http/api.ts`, a function in the client's `apiClient.ts`, and a test in `api.test.ts`.
- **Adding state to a character:** add the field in `createCharacter`; cloning, hashing and snapshots pick it up. It is reset between rounds unless `startNextRound` in `match.ts` carries it over.
- **Adding a move:** add it to `moves.ts`; put it in a deck; `validateDeck` will tell you if the stances do not chain.
- **Adding a message:** define it in `protocol`, handle it in `DuelRoom` and `DuelSession`, bump `PROTOCOL_VERSION`.

## How to keep this document current

When a change adds, removes or re-purposes a file listed here, or lifts one of the "current limits", edit that section and the "last updated" line in the same commit.
