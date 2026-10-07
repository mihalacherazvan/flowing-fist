# Flowing Fist

A browser-based, Absolver-style 1v1 martial-arts game. You fight from one of four stances, and a combat deck you build decides which attacks chain from each stance.

The fight is a deterministic 60 Hz simulation in plain TypeScript. The browser runs it for offline training and for predicting online play; the server runs the same code as the authority.

## Status

Milestones M0–M5 of the [spec](docs/SPEC.md#milestones) are done: you can fight a training dummy offline, play ranked matches against players of similar rating or private duels by code (first to 3 rounds, with parries and feints), build and save your own decks, and play as a guest or with an account. Polish and launch (M6) are next.

Combat numbers are placeholders, and half of the moves still borrow another move's animation.

## Documentation

| Document | What it covers |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | The plan: scope, tech stack, combat and netcode design, milestones |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | What each package and file does today, with its current limits |
| [docs/GAMEPLAY.md](docs/GAMEPLAY.md) | Controls, combat rules, the move list and the default deck |
| [docs/ASSETS.md](docs/ASSETS.md) | Getting a character and its animations from Mixamo into the game |

## Getting started

You need Node 22 or later, pnpm 11, and Docker for the database.

```sh
pnpm install
docker compose up -d   # MariaDB, on port 3307
pnpm run client        # the game, on http://localhost:3000
pnpm run server        # duels, accounts and decks, on port 2567
```

The server creates its database and tables by itself on start-up.

Training mode needs only the client. Everything else needs the server and the database: press **B** in the game for online play, the deck editor and your account. For a ranked match press **O** in two browsers (or one normal and one private window, since an account cannot be matched against itself); for a private duel, create one from the menu and join it with its code from another tab.

### Character model

The model files are not in the repository. The game loads one GLB per character from `apps/client/public/models/` (the masked fighter by default, Y Bot as the other choice in the menu), which `pnpm assets` builds from Mixamo downloads placed in `assets-src/`. It needs Blender 4.4 or later.

[docs/ASSETS.md](docs/ASSETS.md) has the whole workflow: what to download from Mixamo and with which settings, where to put it, and how to add a new animation.

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
| `pnpm test` | Unit tests (sim, content, netcode, the client's animation choices) and server tests; needs the database running |
| `pnpm test:e2e` | Browser tests; starts its own client and server, and needs the database running |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript checks across all packages |
| `pnpm build` | Production build of the client |
| `pnpm assets` | Builds the character model from the Mixamo downloads in `assets-src/`; needs Blender |

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
assets-src/        Mixamo downloads the model is built from (not in git)
docs/              spec, architecture, gameplay and assets
```

`sim`, `content`, `netcode` and `protocol` contain no Babylon.js or Colyseus code, so they run and are tested in plain Node. See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for how they fit together.
