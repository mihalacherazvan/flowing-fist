# Flowing Fist

A browser-based, Absolver-style 1v1 martial-arts game. You fight from one of four stances, and a combat deck you build decides which attacks chain from each stance.

The fight is a deterministic 60 Hz simulation in plain TypeScript. The browser runs it for offline training and for predicting online play; the server runs the same code as the authority.

## Status

Milestones M0–M4 of the [spec](docs/SPEC.md#milestones) are done: you can fight a training dummy offline, duel another player online, build and save your own decks, and play as a guest or with an account. Matchmaking, rounds and ratings (M5) are next.

Combat numbers are placeholders and there are no attack animations yet. An attack shows as the character sliding forward plus a coloured hitbox overlay.

## Documentation

| Document | What it covers |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | The plan: scope, tech stack, combat and netcode design, milestones |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | What each package and file does today, with its current limits |
| [docs/GAMEPLAY.md](docs/GAMEPLAY.md) | Controls, combat rules, the move list and the default deck |

## Getting started

You need Node 22 or later, pnpm 11, and Docker for the database.

```sh
pnpm install
docker compose up -d   # MariaDB, on port 3307
pnpm run client        # the game, on http://localhost:3000
pnpm run server        # duels, accounts and decks, on port 2567
```

The server creates its database and tables by itself on start-up.

Training mode needs only the client. Everything else needs the server and the database: press **B** in the game for the deck editor and your account, and for a duel open the game in two tabs and press **O** in each.

### Character model

The model files are not in the repository. Before the game can load, put the Mixamo Y-bot export at:

```
apps/client/public/models/y-bot/y-bot-with-animations.glb
```

#### Mixamo vendor

The character and its animations come from [Mixamo](https://www.mixamo.com) (free, needs an Adobe account). Mixamo exports FBX, so the files go through Blender to become GLB.

1. In Mixamo, open **Characters** and pick **Y Bot**.
2. Download the character on its own: **Download**, format **FBX Binary (.fbx)**, pose **T-pose**.
3. Open **Animations** and, for each clip below, tick **In Place** where the option is offered (the simulation moves the character, not the animation), then **Download** with format **FBX Binary (.fbx)**, skin **With Skin**, 30 frames per second.

   | Mixamo animation | Name the game expects |
   |---|---|
   | Fighting Idle | `idle` |
   | Running | `run-forward` |
   | Running Backward | `run-backward` |
   | Left Strafe | `left-strafe` |
   | Right Strafe | `right-strafe` |

4. In Blender, import the T-pose FBX, then each animation FBX. Rename each imported action to the name in the table and assign them all to the T-pose armature (one NLA track per action). Delete the extra armatures and meshes the animation files brought in.
5. Export with **File → Export → glTF 2.0**, format **glTF Binary (.glb)**, animations included, to `apps/client/public/models/y-bot/y-bot-with-animations.glb`.

The game looks animations up by those exact names, so a clip with a different name is silently never played.

Optionally, also export each animation on its own to `apps/client/public/models/y-bot/animations/<name>.glb`.  of any clips in `apps/client/public/models/<character>/animations/` to a `clips/` folder next to them.

### Configuration

| Setting | Where | Default |
|---|---|---|
| Server port | `PORT` | `2567` |
| Database | `DATABASE_URL` | `mysql://root:flowing_fist@localhost:3307/flowing_fist`, the one from `docker-compose.yml` |
| Secret that signs player tokens | `JWT_SECRET` | a fixed development value |
| Port the database container is published on | `DATABASE_PORT`, read by `docker compose` | `3307` |
| Server address used by the client | `VITE_SERVER_URL` | the page's host on port `2567` |
| Artificial network delay | `?latency=80` in the page address (milliseconds each way) | none |

The server's settings can go in `apps/server/.env`; see `apps/server/.env.example`. With `NODE_ENV=production` the server refuses to start unless `DATABASE_URL` and `JWT_SECRET` are set.

## Commands

| Command | What it does |
|---|---|
| `pnpm run client` | Vite dev server for the game |
| `docker compose up -d` | Starts the database (`docker compose down` stops it, keeping the data) |
| `pnpm run server` | Colyseus server and HTTP API, restarts on change |
| `pnpm test` | Unit tests (sim, content, netcode) and server tests; needs the database running |
| `pnpm test:e2e` | Browser tests; starts its own client and server, and needs the database running |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript checks across all packages |
| `pnpm build` | Production build of the client |
| `pnpm assets` | Regenerates animation-only clips from the model files |

The browser tests need Chromium once: `pnpm exec playwright install chromium` in `apps/client`.

## Repository layout

```
apps/client        the game in the browser: input, rendering, HUD (Babylon.js, React, Vite)
apps/server        Colyseus server: one room per fight, plus the HTTP API for accounts and decks
packages/sim       the fight simulation
packages/content   moves, decks, arenas (data and rules)
packages/netcode   server authority and client prediction
packages/protocol  network message definitions
tools/assets       asset preparation scripts
docs/              spec, architecture and gameplay
```

`sim`, `content`, `netcode` and `protocol` contain no Babylon.js or Colyseus code, so they run and are tested in plain Node. See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for how they fit together.
